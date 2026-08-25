import WebSocket from "ws";
import Logger from "../utils/Logger.js";
import { AuthService } from "./AuthService.js";

const WEBSOCKET_URL = "wss://ws.programmers.co.kr:443/cable";
const CONNECT_TIMEOUT_MS = 10_000;
const OPERATION_TIMEOUT_MS = 60_000;

interface CableMessage {
  type?: string;
  identifier?: string;
  message?: CablePayload;
}

interface CablePayload {
  type?: string;
  action?: string;
  status?: string;
  msg?: string;
  passedCount?: number;
  totalCount?: number;
  result?: TestCaseResult[];
  testcaseIds?: number[];
  testcasesCount?: number;
  testcaseId?: number;
  index?: number;
  stdout?: string;
  stderr?: string;
  passed?: boolean;
  scores?: { name: string; score: string }[];
  userScore?: string;
  perfectScore?: string;
}

interface ChannelParams {
  channel: string;
  challengeable_type: string;
  challengeable_id: number;
  language: string;
  lesson_id: number;
}

interface ConfirmationHandler {
  confirm: () => void;
  reject: (error: Error) => void;
}

export interface TestCaseResult {
  passed: boolean;
  caseNumber?: number;
  runtime?: number;
  memory?: number;
  message?: string;
  stdout?: string;
  stderr?: string;
  expected?: string;
  actual?: string;
}

export interface SubmissionResult {
  status: "pending" | "running" | "pass" | "fail" | "error";
  passedCount?: number;
  totalCount?: number;
  results?: TestCaseResult[];
  message?: string;
  output?: string;
}

export class SubmissionService {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<
    string,
    (result: SubmissionResult) => void
  >();
  private readonly confirmations = new Map<string, ConfirmationHandler>();
  private activeOperation = false;

  constructor(private readonly authService: AuthService) {}

  async submitCode(
    lessonId: number,
    challengeableId: number,
    solutionId: string,
    code: string,
    language: string,
    onProgress: (result: SubmissionResult) => void
  ): Promise<SubmissionResult> {
    if (this.activeOperation) {
      return {
        status: "error",
        message: "이미 실행 중인 채점 작업이 있습니다.",
      };
    }

    this.activeOperation = true;
    try {
      await this.connect();
      if (!this.ws) {
        throw new Error("WebSocket 연결 실패");
      }

      const params: ChannelParams = {
        channel: "Challenge::AlgorithmChannel",
        challengeable_type: "algorithm",
        challengeable_id: challengeableId,
        language,
        lesson_id: lessonId,
      };
      const identifier = JSON.stringify(params);
      const results: TestCaseResult[] = [];
      let totalCount: number | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      return await new Promise<SubmissionResult>((resolve) => {
        let settled = false;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          this.handlers.delete(identifier);
          this.confirmations.delete(identifier);
          this.disconnect();
        };

        const finish = (result: SubmissionResult) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        const emit = (result: SubmissionResult) => {
          if (result.results?.length) {
            for (const item of result.results) {
              const existingIndex = item.caseNumber
                ? results.findIndex(
                    (current) => current.caseNumber === item.caseNumber
                  )
                : -1;
              if (existingIndex >= 0) {
                results[existingIndex] = item;
              } else {
                results.push(item);
              }
            }
          }
          if (result.totalCount !== undefined) totalCount = result.totalCount;

          const enriched: SubmissionResult = {
            ...result,
            passedCount: results.length
              ? results.filter((item) => item.passed).length
              : result.passedCount,
            totalCount: totalCount ?? result.totalCount,
            results: results.length ? [...results] : result.results,
          };
          onProgress(enriched);

          if (
            enriched.status === "pass" ||
            enriched.status === "fail" ||
            enriched.status === "error"
          ) {
            finish(enriched);
          }
        };

        this.handlers.set(identifier, emit);
        this.confirmations.set(identifier, {
          confirm: () => {
            this.performAction(identifier, code, solutionId);
          },
          reject: (error) => {
            finish({ status: "error", message: error.message });
          },
        });

        timer = setTimeout(() => {
          finish({ status: "error", message: "채점 시간 초과 (60초)" });
        }, OPERATION_TIMEOUT_MS);

        this.subscribe(params);
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.activeOperation = false;
      this.disconnect();
    }
  }

  private async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const cookie = await this.authService.getSessionCookie();
    if (!cookie) {
      throw new Error("세션 쿠키가 설정되지 않았습니다.");
    }

    const cookieHeader = cookie.includes("=")
      ? cookie
      : `_session_production=${cookie}`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
      };

      try {
        this.ws = new WebSocket(WEBSOCKET_URL, {
          headers: {
            Cookie: cookieHeader,
            Origin: "https://school.programmers.co.kr",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
      } catch (error) {
        finish(() => reject(error));
        return;
      }

      const timeout = setTimeout(() => {
        this.disconnect();
        finish(() => reject(new Error("WebSocket 연결 타임아웃")));
      }, CONNECT_TIMEOUT_MS);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        finish(resolve);
      });
      this.ws.on("message", (data) => this.handleMessage(data.toString()));
      this.ws.on("error", (error) => {
        clearTimeout(timeout);
        finish(() => reject(error));
      });
      this.ws.on("close", () => {
        clearTimeout(timeout);
        this.ws = null;
      });
    });
  }

  private subscribe(params: ChannelParams): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket가 연결되어 있지 않습니다.");
    }
    this.ws.send(
      JSON.stringify({
        command: "subscribe",
        identifier: JSON.stringify(params),
      })
    );
  }

  private performAction(
    identifier: string,
    code: string,
    solutionId: string
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        command: "message",
        identifier,
        data: JSON.stringify({
          codes: { [solutionId]: code },
          action: "submit",
        }),
      })
    );
  }

  private handleMessage(rawData: string): void {
    let data: CableMessage;
    try {
      data = JSON.parse(rawData) as CableMessage;
    } catch {
      Logger.error("WebSocket 메시지를 해석하지 못했습니다.");
      return;
    }

    if (data.type === "ping" || data.type === "welcome") return;

    if (data.type === "confirm_subscription" && data.identifier) {
      this.confirmations.get(data.identifier)?.confirm();
      return;
    }

    if (data.type === "reject_subscription" && data.identifier) {
      this.confirmations.get(data.identifier)?.reject(
        new Error("채널 구독이 거부되었습니다.")
      );
      return;
    }

    if (!data.identifier || !data.message) return;
    const handler = this.handlers.get(data.identifier);
    if (!handler) return;

    const result = this.mapPayload(data.message);
    if (result) handler(result);
  }

  private mapPayload(message: CablePayload): SubmissionResult | null {
    if (message.type === "start") {
      return { status: "running", message: message.msg };
    }
    if (message.type === "test_group") {
      return {
        status: "running",
        totalCount: message.testcaseIds?.length,
        message: message.msg,
      };
    }
    if (message.type === "testcase") {
      return {
        status: "running",
        totalCount: message.testcasesCount,
        message: message.msg,
        output: message.stdout || message.stderr,
        results: [
          {
            passed: Boolean(message.passed),
            caseNumber:
              message.index !== undefined ? message.index + 1 : message.testcaseId,
            message: message.msg,
            stdout: message.stdout,
            stderr: message.stderr,
          },
        ],
      };
    }
    if (message.type === "result") {
      const passedCount = message.passedCount || 0;
      const totalCount = message.totalCount || 1;
      return {
        status: message.passed ? "pass" : "fail",
        passedCount,
        totalCount,
        message: `${passedCount}/${totalCount} 통과`,
        results: message.result,
      };
    }
    if (message.type === "result_lesson_challenge") {
      const score = message.scores?.[0]?.score || message.userScore || "0";
      return {
        status: message.passed ? "pass" : "fail",
        message: `점수: ${score}/${message.perfectScore || "100"}`,
        passedCount: message.passed ? message.testcasesCount : 0,
        totalCount: message.testcasesCount,
        results: message.result,
      };
    }
    if (message.type === "error") {
      return {
        status: "error",
        message: message.msg || "서버 오류가 발생했습니다.",
        output: message.msg,
      };
    }
    if (message.status === "running" || message.type === "running") {
      return { status: "running", message: message.msg };
    }
    if (message.status === "pass" || message.type === "pass") {
      return {
        status: "pass",
        passedCount: message.passedCount,
        totalCount: message.totalCount,
        results: message.result,
      };
    }
    if (message.status === "fail" || message.type === "fail") {
      return {
        status: "fail",
        passedCount: message.passedCount,
        totalCount: message.totalCount,
        results: message.result,
      };
    }
    return null;
  }

  disconnect(): void {
    if (!this.ws) return;
    this.ws.removeAllListeners();
    this.ws.close();
    this.ws = null;
  }

  dispose(): void {
    this.handlers.clear();
    this.confirmations.clear();
    this.disconnect();
  }
}
