import * as cheerio from "cheerio";
import { IOExample, Problem } from "../types/index.js";
import { AuthService } from "./AuthService.js";

const PROGRAMMERS_BASE_URL = "https://school.programmers.co.kr";
const PROGRAMMERS_API_URL = "https://school.programmers.co.kr/api/v2";

/**
 * API 응답 타입
 */
interface ChallengeListResponse {
  page: number;
  perPage: number;
  totalPages: number;
  totalEntries: number;
  result: ApiChallenge[];
}

interface ApiChallenge {
  id: number;
  title: string;
  partTitle: string;
  level: number;
  finishedCount: number;
  acceptanceRate: number;
  status: "unsolved" | "solving" | "solved" | "solved_with_unlock";
}

/**
 * 문제 목록 결과
 */
export interface ProblemListResult {
  problems: Problem[];
  totalPages: number;
  totalEntries: number;
  currentPage: number;
}

/**
 * 프로그래머스 API 서비스 (v2)
 */
export class ScrapingService {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * 문제 목록 가져오기 (필터 지원)
   */
  async fetchProblemList(
    page = 1,
    perPage = 30,
    levels: number[] = [0, 1, 2, 3, 4, 5],
    statuses: string[] = [
      "unsolved",
      "solving",
      "solved",
      "solved_with_unlock",
    ],
    languages: string[] = ["javascript", "python3", "java", "cpp"]
  ): Promise<ProblemListResult> {
    const headers = await this.authService.getAuthHeaders();

    try {
      // URL 파라미터 수동 구성 (배열 형태 지원)
      const params = new URLSearchParams();
      params.append("perPage", String(perPage));
      params.append("page", String(page));
      params.append("order", "recent");

      // 레벨 필터
      levels.forEach((l) => params.append("levels[]", String(l)));

      // 상태 필터
      statuses.forEach((s) => params.append("statuses[]", s));

      // 언어 필터
      languages.forEach((lang) => params.append("languages[]", lang));

      const response = await this.fetchJson<ChallengeListResponse>(
        `${PROGRAMMERS_API_URL}/school/challenges/?${params.toString()}`,
        { ...headers, Accept: "application/json" }
      );

      if (response?.result) {
        const problems = response.result.map((challenge) => ({
          id: String(challenge.id),
          title: challenge.title,
          level: challenge.level,
          isSolved:
            challenge.status === "solved" ||
            challenge.status === "solved_with_unlock",
          link: `${PROGRAMMERS_BASE_URL}/learn/courses/30/lessons/${challenge.id}`,
        }));

        return {
          problems,
          totalPages: response.totalPages,
          totalEntries: response.totalEntries,
          currentPage: response.page,
        };
      }

      return { problems: [], totalPages: 1, totalEntries: 0, currentPage: 1 };
    } catch (error) {
      console.error("API 호출 실패:", error);
      throw new Error("문제 목록을 가져오는데 실패했습니다.");
    }
  }

  /**
   * 문제 상세 정보 가져오기
   * @param language 언어 (예: javascript, python3, cpp)
   */
  async fetchProblemDetail(
    problemId: string,
    language = "javascript"
  ): Promise<Problem | null> {
    const authHeaders = await this.authService.getAuthHeaders();

    const browserHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://school.programmers.co.kr/learn/challenges",
    };
    const headers = { ...browserHeaders, ...authHeaders };

    try {
      const detailUrl = `${PROGRAMMERS_BASE_URL}/learn/courses/30/lessons/${problemId}?language=${language}`;
      const [authenticatedPage, publicPage] = await Promise.allSettled([
        this.fetchText(detailUrl, headers),
        this.fetchText(detailUrl, browserHeaders),
      ]);

      if (authenticatedPage.status === "rejected") {
        return null;
      }

      const defaultTemplateCode =
        publicPage.status === "fulfilled"
          ? this.extractTemplateCode(cheerio.load(publicPage.value))
          : null;

      return this.parseProblemDetailHtml(
        authenticatedPage.value,
        problemId,
        defaultTemplateCode
      );
    } catch (error) {
      console.error(`문제 ${problemId} 상세 정보 가져오기 실패:`, error);
      return null;
    }
  }

  /**
   * 문제 상세 HTML 파싱
   */
  private parseProblemDetailHtml(
    html: string,
    problemId: string,
    defaultTemplateCode?: string | null
  ): Problem {
    const $ = cheerio.load(html);

    // data-lesson-title 속성에서 제목 추출 (가장 정확함)
    let title =
      $("[data-lesson-title]").attr("data-lesson-title")?.trim() || "";

    // fallback: 기존 방식으로 제목 찾기
    if (!title) {
      title =
        $("h2.challenge-title, .lesson-title, h1").first().text().trim() ||
        `Problem ${problemId}`;
    }

    const descriptionHtml = this.sanitizeHtml(
      $(".guide-section, .problem-description, .markdown").first().html() || ""
    );

    const constraints: string[] = [];
    $(".constraint-list li, .restriction li").each((_, el) => {
      const text = $(el).text().trim();
      if (text) constraints.push(text);
    });

    const parsedExamples = this.extractIOExamples($);
    const templateCode =
      defaultTemplateCode === undefined
        ? this.extractTemplateCode($)
        : defaultTemplateCode?.trim() ?? "";
    const levelText = $(".level, [class*='level']").text();
    const level = this.parseLevel(levelText);
    const interfaceTypeAttr = $("[data-interface-type]")
      .first()
      .attr("data-interface-type");
    const interfaceType = interfaceTypeAttr === "stdin" ? "stdin" : "function";
    const templateParameterNames = this.extractParameterNames(templateCode);
    const parameterNames =
      templateParameterNames.length > 0
        ? templateParameterNames
        : parsedExamples.parameterNames;

    // challengeable_id 추출 (WebSocket 제출에 필요)
    const challengeableIdAttr = $("[data-challengeable-id]").attr(
      "data-challengeable-id"
    );
    const challengeableId = challengeableIdAttr
      ? parseInt(challengeableIdAttr, 10)
      : undefined;

    // solution_id 추출 (codes 객체의 키로 사용)
    const solutionIdElement = $("input[data-type='code']");
    const solutionId = solutionIdElement.attr("id") || undefined;

    return {
      id: problemId,
      title,
      level,
      isSolved: false,
      link: `${PROGRAMMERS_BASE_URL}/learn/courses/30/lessons/${problemId}`,
      challengeableId,
      solutionId,
      descriptionHtml,
      templateCode,
      constraints,
      ioExamples: parsedExamples.ioExamples,
      interfaceType,
      parameterNames,
    };
  }

  private extractIOExamples($: cheerio.CheerioAPI): {
    ioExamples: IOExample[];
    parameterNames: string[];
  } {
    const ioExamples: IOExample[] = [];
    let parameterNames: string[] = [];

    $("table").each((_, table) => {
      if (ioExamples.length > 0) {
        return;
      }

      const rows = $(table).find("tr");
      const headerCells = rows.first().find("th");
      const headers = headerCells
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());

      if (
        headers.length < 2 ||
        !/(result|output|결과|출력)/i.test(headers[headers.length - 1])
      ) {
        return;
      }

      parameterNames = headers.slice(0, -1);
      const dataRows = $(table).find("tbody tr").length
        ? $(table).find("tbody tr")
        : rows.slice(1);

      dataRows.each((__, row) => {
        const values = $(row)
          .find("td")
          .toArray()
          .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());

        if (values.length < headers.length) {
          return;
        }

        const inputs = values.slice(0, headers.length - 1);
        ioExamples.push({
          input: inputs.join(", "),
          inputs,
          output: values[values.length - 1],
        });
      });
    });

    if (ioExamples.length === 0) {
      $("table tbody tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 2) {
          ioExamples.push({
            input: $(cells[0]).text().trim(),
            inputs: [$(cells[0]).text().trim()],
            output: $(cells[cells.length - 1]).text().trim(),
          });
        }
      });
    }

    return { ioExamples, parameterNames };
  }

  private parseLevel(levelText: string): number {
    const match = levelText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private extractTemplateCode($: cheerio.CheerioAPI): string {
    const codeTextarea = $("textarea#code").first();
    const textareaCode = codeTextarea.val();
    if (typeof textareaCode === "string" && textareaCode.trim()) {
      return textareaCode.replace(/\r\n/g, "\n");
    }

    const codeElement = $("[data-code], [data-initial-code]").first();
    const dataCode =
      codeElement.attr("data-code") || codeElement.attr("data-initial-code");
    if (dataCode?.trim()) {
      return this.decodeTemplateCode(dataCode);
    }

    const scripts = $("script").toArray();
    for (const script of scripts) {
      const content = $(script).html() || "";
      const match = content.match(/initialCode\s*[=:]\s*["'`]([\s\S]*?)["'`]/);
      if (match) {
        return this.decodeTemplateCode(match[1]);
      }
    }
    return "";
  }

  private decodeTemplateCode(code: string): string {
    return code
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\r\n/g, "\n");
  }

  private extractParameterNames(templateCode: string): string[] {
    const match = templateCode.match(
      /(?:def|function)\s+solution\s*\(([^)]*)\)/
    );

    if (!match || !match[1].trim()) {
      return [];
    }

    return match[1]
      .split(",")
      .map((parameter) => parameter.trim().split(/\s|=/)[0])
      .filter(Boolean);
  }

  private async fetchText(
    url: string,
    headers: Record<string, string>
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (!response.ok || response.status >= 300) {
        throw new Error(`Programmers response: ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson<T>(
    url: string,
    headers: Record<string, string>
  ): Promise<T> {
    return JSON.parse(await this.fetchText(url, headers)) as T;
  }

  private sanitizeHtml(html: string): string {
    const fragment = cheerio.load(html, null, false);
    fragment("script, style, iframe, object, embed, form, input, button").remove();
    fragment("*").each((_, element) => {
      const attributes = "attribs" in element ? element.attribs : {};
      for (const attribute of Object.keys(attributes)) {
        if (attribute.toLowerCase().startsWith("on")) {
          fragment(element).removeAttr(attribute);
        }
      }

      for (const attribute of ["href", "src", "action"]) {
        const value = fragment(element).attr(attribute);
        if (value?.trim().toLowerCase().startsWith("javascript:")) {
          fragment(element).removeAttr(attribute);
        }
      }
    });
    return fragment.root().html() || "";
  }
}
