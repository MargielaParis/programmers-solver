import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LANGUAGE_COMMENTS,
  LANGUAGE_EXTENSIONS,
  Problem,
  SupportedLanguage,
} from "../types";
import { SolutionContextService } from "./SolutionContextService.js";

/**
 * 파일 시스템 서비스 - 문제 파일 생성 및 관리
 */
export class FileService {
  private readonly solutionContext = new SolutionContextService();
  /**
   * 문제 파일 생성
   */
  async createProblemFile(
    problem: Problem,
    language: string
  ): Promise<vscode.Uri | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("워크스페이스 폴더가 열려있지 않습니다.");
      return null;
    }

    const templateCode = problem.templateCode;
    if (!templateCode?.trim()) {
      vscode.window.showErrorMessage(
        "프로그래머스 웹 템플릿을 가져오지 못해 파일을 만들 수 없습니다."
      );
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const problemsDir = path.join(workspaceRoot, "problems");

    // problems 디렉토리 생성
    if (!fs.existsSync(problemsDir)) {
      fs.mkdirSync(problemsDir, { recursive: true });
    }

    // JavaScript일 때 TypeScript 옵션 확인
    let extension = LANGUAGE_EXTENSIONS[language] || "txt";
    if (language === "javascript") {
      const config = vscode.workspace.getConfiguration("programmers");
      const useTypeScript = config.get<boolean>("useTypeScript", false);
      if (useTypeScript) {
        extension = "ts";
      }
    }

    // 문제별 디렉토리 생성 (P_ID_제목 형태)
    const sanitizedTitle = this.sanitizeFileName(problem.title);
    const problemDirName = `P_${problem.id}_${sanitizedTitle}`;
    const problemDir = path.join(problemsDir, problemDirName);

    if (!fs.existsSync(problemDir)) {
      fs.mkdirSync(problemDir, { recursive: true });
    }

    // 파일명은 solution.{확장자}
    const fileName = `solution.${extension}`;
    const filePath = path.join(problemDir, fileName);
    const content = this.generateFileContent(problem, language, templateCode);

    // 기존 풀이가 있으면 시그니처가 다른 경우에만 교체 여부를 묻는다.
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, "utf-8");
      const expectedSignature = this.extractSolutionSignature(
        templateCode,
        language
      );
      const existingSignature = this.extractSolutionSignature(
        existingContent,
        language
      );

      if (
        expectedSignature &&
        existingSignature &&
        expectedSignature !== existingSignature
      ) {
        const action = await vscode.window.showWarningMessage(
          "기존 파일의 solution 함수 시그니처가 프로그래머스 웹 템플릿과 다릅니다.",
          "웹 템플릿으로 교체",
          "기존 코드 유지"
        );

        if (action === "웹 템플릿으로 교체") {
          const backupPath = `${filePath}.before-programmers-template`;
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(filePath, backupPath);
          }
          fs.writeFileSync(filePath, content, "utf-8");
        }
      }

      const uri = vscode.Uri.file(filePath);
      await vscode.window.showTextDocument(uri);
      return uri;
    }

    fs.writeFileSync(filePath, content, "utf-8");

    const uri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(uri);
    return uri;
  }

  /**
   * 파일명에서 사용할 수 없는 문자 제거
   */
  private sanitizeFileName(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
  }

  private extractSolutionSignature(
    code: string,
    language: string
  ): string | null {
    const pattern =
      language === "python3"
        ? /\bdef\s+solution\s*\([^)]*\)\s*:/
        : language === "javascript"
          ? /\bfunction\s+solution\s*\([^)]*\)/
          : /\b[\w:<>,\s*&]+\s+solution\s*\([^)]*\)/;
    const match = code.match(pattern);
    return match ? match[0].replace(/\s+/g, " ").trim() : null;
  }

  /**
   * 파일 내용 생성 (메타데이터 주석 + 템플릿 코드)
   */
  private generateFileContent(
    problem: Problem,
    language: string,
    templateCode: string
  ): string {
    const metadata = LANGUAGE_EXTENSIONS[language]
      ? this.solutionContext.createFileMetadata(
          problem,
          language as SupportedLanguage
        )
      : [`${LANGUAGE_COMMENTS[language]?.start || "//"} [P_${problem.id}] ${problem.title}`, ""];

    return `${metadata.join("\n")}${templateCode}`;
  }
}
