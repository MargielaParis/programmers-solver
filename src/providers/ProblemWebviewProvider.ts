import { randomBytes } from "crypto";
import * as fs from "fs";
import * as vscode from "vscode";
import {
  ExtensionToWebviewMessage,
  Problem,
  ProblemViewPayload,
  SubmissionStatusPayload,
  WebviewToExtensionMessage,
} from "../types/index.js";
import { SubmissionResult } from "../services/SubmissionService.js";

export class ProblemWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "programmers.problemView";
  private view?: vscode.WebviewView;
  private currentProblem?: ProblemViewPayload;
  private submissionStatus?: SubmissionStatusPayload;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "webview-ui", "dist"),
      ],
    };
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      this.handleMessage(message);
    });
    this.postState();
  }

  loadProblem(problem: Problem): void {
    const config = vscode.workspace.getConfiguration("programmers");
    this.currentProblem = {
      ...problem,
      descriptionHtml: problem.descriptionHtml || "<p>문제 설명을 불러오는 중...</p>",
      constraints: problem.constraints || [],
      ioExamples: problem.ioExamples || [],
      imageSettings: {
        grayscale: config.get<boolean>("image.grayscale", true),
        opacity: config.get<number>("image.opacity", 0.5),
        hoverRestore: config.get<boolean>("image.hoverRestore", false),
      },
    };
    this.submissionStatus = undefined;
    this.view?.show?.(true);
    this.postState();
  }

  updateSubmissionStatus(
    operation: "run" | "submit",
    result: SubmissionResult
  ): void {
    this.submissionStatus = {
      operation,
      status: result.status === "pending" ? "running" : result.status,
      message: result.message,
      output: result.output,
      details: {
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        results: result.results,
      },
    };
    this.postState();
  }

  private postState(): void {
    const message: ExtensionToWebviewMessage = {
      command: "SYNC_STATE",
      payload: {
        problem: this.currentProblem,
        submissionStatus: this.submissionStatus,
      },
    };
    this.view?.webview.postMessage(message);
  }

  private handleMessage(message: unknown): void {
    if (!this.isWebviewMessage(message)) return;
    switch (message.command) {
      case "READY":
        this.postState();
        break;
      case "RUN_CODE":
        void vscode.commands.executeCommand("programmers.runCode");
        break;
      case "SUBMIT_CODE":
        void vscode.commands.executeCommand("programmers.submitCode");
        break;
    }
  }

  private isWebviewMessage(message: unknown): message is WebviewToExtensionMessage {
    if (!message || typeof message !== "object") return false;
    const command = (message as { command?: unknown }).command;
    return command === "READY" || command === "RUN_CODE" || command === "SUBMIT_CODE";
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, "webview-ui", "dist");
    const indexUri = vscode.Uri.joinPath(distPath, "index.html");
    const nonce = randomBytes(16).toString("hex");

    try {
      let html = fs.readFileSync(indexUri.fsPath, "utf-8");
      const baseUri = webview.asWebviewUri(distPath).toString();
      html = html
        .replace(/(src|href)="\.\/assets\//g, `$1="${baseUri}/assets/`)
        .replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">`)
        .replace(/<script(?=\s[^>]*src=)/g, `<script nonce="${nonce}"`);
      return html;
    } catch (error) {
      console.error("ProgrammersSolver webview를 불러오지 못했습니다.", error);
      return this.getDefaultHtml(webview.cspSource);
    }
  }

  private getDefaultHtml(cspSource: string): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    strong { color: #62c6b7; }
  </style>
</head>
<body><strong>ProgrammersSolver</strong><p>왼쪽 문제 목록에서 문제를 선택하세요.</p></body>
</html>`;
  }
}
