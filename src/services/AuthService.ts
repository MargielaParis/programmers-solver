import * as vscode from "vscode";

const PROGRAMMERS_BASE_URL = "https://school.programmers.co.kr";
const SESSION_KEY = "programmers-session-cookie";

/**
 * 인증 서비스 - 세션 쿠키 관리 및 Webview 로그인
 */
export class AuthService {
  private readonly onDidChangeSessionEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 세션 쿠키 저장 (SecretStorage 사용)
   */
  async setSessionCookie(cookie: string): Promise<void> {
    await this.context.secrets.store(SESSION_KEY, cookie.trim());
    this.onDidChangeSessionEmitter.fire();
  }

  /**
   * 저장된 세션 쿠키 가져오기
   */
  async getSessionCookie(): Promise<string | undefined> {
    return await this.context.secrets.get(SESSION_KEY);
  }

  /**
   * 세션 쿠키 삭제
   */
  async clearSessionCookie(): Promise<void> {
    await this.context.secrets.delete(SESSION_KEY);
    this.onDidChangeSessionEmitter.fire();
  }

  /**
   * 세션 유효성 검사
   */
  async validateSession(): Promise<boolean> {
    const cookie = await this.getSessionCookie();
    if (!cookie) {
      return false;
    }

    try {
      const response = await fetch(`${PROGRAMMERS_BASE_URL}/learn/challenges`, {
        headers: {
          Cookie: cookie,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        redirect: "manual",
      });

      // 로그인 페이지로 리다이렉트되면 실패
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 인증된 HTTP 요청을 위한 헤더 반환
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const cookie = await this.getSessionCookie();
    return {
      Cookie: cookie || "",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    };
  }

  /**
   * 브라우저에서 로그인 페이지 열기
   * 사용자가 로그인 후 쿠키를 자동으로 가져옴
   */
  async openLoginInBrowser(): Promise<void> {
    // 쿠키 복사 방법 안내 알림창 먼저 표시
    const proceed = await vscode.window.showInformationMessage(
      `ProgrammersSolver Chrome Helper에서 쿠키 전체를 복사한 뒤 VS Code에 붙여넣으세요.\n` +
        `Chrome Helper가 없으면 개발자 도구의 Application → Cookies에서 전체 쿠키 문자열을 복사할 수 있습니다.`,
      { modal: true },
      "브라우저 열기"
    );

    if (proceed !== "브라우저 열기") {
      return;
    }

    // 외부 브라우저에서 로그인 페이지 열기
    const loginUrl = vscode.Uri.parse(
      "https://programmers.co.kr/account/sign_in?referer=https://programmers.co.kr/"
    );
    await vscode.env.openExternal(loginUrl);

    // 로그인 후 쿠키 입력 안내
    const action = await vscode.window.showInformationMessage(
      "로그인 완료 후 쿠키를 복사하셨나요?",
      "쿠키 입력하기",
      "가이드 다시 보기"
    );

    if (action === "쿠키 입력하기") {
      await this.promptForCookie();
    } else if (action === "가이드 다시 보기") {
      this.showCookieGuide();
    }
  }

  /**
   * 쿠키 입력 프롬프트
   */
  async promptForCookie(): Promise<boolean> {
    const cookie = await vscode.window.showInputBox({
      prompt: "프로그래머스 세션 쿠키를 입력하세요",
      placeHolder: "tracking_id=...; _session_production=...",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "쿠키 값을 입력해주세요";
        }
        return null;
      },
    });

    if (!cookie) {
      return false;
    }

    await this.setSessionCookie(cookie.trim());

    // 유효성 검사
    const isValid = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "세션 유효성 검사 중...",
      },
      async () => {
        return await this.validateSession();
      }
    );

    if (isValid) {
      vscode.window.showInformationMessage(
        "✅ 로그인 성공! 세션이 저장되었습니다."
      );
      return true;
    } else {
      vscode.window.showWarningMessage(
        "⚠️ 쿠키가 저장되었지만 유효하지 않을 수 있습니다."
      );
      return false;
    }
  }

  /**
   * 쿠키 가이드 Webview
   */
  showCookieGuide(): void {
    const panel = vscode.window.createWebviewPanel(
      "cookieGuide",
      "🍪 로그인 가이드",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = this.getCookieGuideHtml();
  }

  /**
   * 쿠키 가이드 HTML
   */
  private getCookieGuideHtml(): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>로그인 가이드</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      padding: 24px;
      line-height: 1.8;
      max-width: 700px;
      margin: 0 auto;
    }
    h1 {
      color: var(--vscode-textLink-foreground, #3794ff);
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
      padding-bottom: 12px;
    }
    .step {
      background: rgba(255, 255, 255, 0.05);
      padding: 16px 20px;
      margin: 16px 0;
      border-radius: 8px;
      border-left: 3px solid var(--vscode-textLink-foreground, #3794ff);
    }
    .step h3 {
      margin-top: 0;
      color: var(--vscode-textLink-foreground, #3794ff);
    }
    code {
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    kbd {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 0.9em;
    }
    .warning {
      background: rgba(204, 167, 0, 0.1);
      border-left-color: #cca700;
      color: #cca700;
    }
    .tip {
      background: rgba(78, 201, 176, 0.1);
      border-left-color: #4ec9b0;
    }
  </style>
</head>
<body>
  <h1>🔐 프로그래머스 로그인 가이드</h1>

  <div class="step">
    <h3>1️⃣ 프로그래머스 로그인</h3>
    <p>브라우저에서 <a href="https://programmers.co.kr">programmers.co.kr</a>에 로그인합니다.</p>
    <p>GitHub, Google 등 원하는 방법으로 로그인하세요.</p>
  </div>

  <div class="step">
    <h3>2️⃣ 개발자 도구 열기</h3>
    <p>
      <strong>Mac:</strong> <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd><br>
      <strong>Windows:</strong> <kbd>F12</kbd> 또는 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>
    </p>
  </div>

  <div class="step">
    <h3>3️⃣ Application 탭 이동</h3>
    <p>상단 탭에서 <code>Application</code> (또는 <code>Storage</code>)을 클릭합니다.</p>
  </div>

  <div class="step">
    <h3>4️⃣ 쿠키 찾기</h3>
    <p>왼쪽 사이드바에서:</p>
    <p><code>Cookies</code> → <code>https://programmers.co.kr</code> 선택</p>
  </div>

  <div class="step">
    <h3>5️⃣ 세션 쿠키 복사</h3>
    <p>Chrome Helper에서 <strong>쿠키 복사</strong>를 누르면 필요한 쿠키가 한 번에 복사됩니다.</p>
    <p>💡 VS Code의 쿠키 입력창에는 쿠키 전체 문자열을 붙여넣으세요.</p>
  </div>

  <div class="step">
    <h3>6️⃣ VS Code에 입력</h3>
    <p>Command Palette에서 <code>Programmers: Set Session Cookie</code>를 실행하고</p>
    <p>복사한 값을 붙여넣습니다.</p>
  </div>

  <div class="step tip">
    <h3>💡 팁: 전체 쿠키 복사</h3>
    <p>여러 쿠키가 필요할 수 있습니다. 이 형식으로 입력하세요:</p>
    <p><code>tracking_id=값; locale=ko; _session_production=값</code></p>
  </div>

  <div class="step warning">
    <h3>⚠️ 보안 안내</h3>
    <p>쿠키는 VS Code의 암호화된 저장소에 안전하게 저장됩니다.</p>
    <p>쿠키를 다른 사람과 공유하지 마세요.</p>
  </div>
</body>
</html>`;
  }

  /**
   * 로그인 상태 확인 후 필요시 로그인 유도
   */
  async ensureLoggedIn(): Promise<boolean> {
    const isValid = await this.validateSession();

    if (isValid) {
      return true;
    }

    const action = await vscode.window.showWarningMessage(
      "프로그래머스에 로그인이 필요합니다.",
      "로그인하기",
      "나중에"
    );

    if (action === "로그인하기") {
      await this.openLoginInBrowser();
      return false;
    }

    return false;
  }

  dispose(): void {
    this.onDidChangeSessionEmitter.dispose();
  }
}
