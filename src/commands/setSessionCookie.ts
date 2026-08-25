import * as vscode from "vscode";
import { AuthService } from "../services/AuthService.js";

/**
 * 세션 쿠키 설정 명령어 등록
 */
export function registerSetSessionCookieCommand(
  context: vscode.ExtensionContext,
  authService: AuthService
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "programmers.setSessionCookie",
    async () => {
      // 현재 로그인 상태 확인
      const isLoggedIn = await authService.validateSession();

      const choices = [
        {
          label: "$(browser) 브라우저에서 로그인",
          value: "browser",
          description: "추천",
        },
        { label: "$(key) 쿠키 직접 입력", value: "input" },
        { label: "$(question) 쿠키 가져오는 방법", value: "guide" },
      ];

      if (isLoggedIn) {
        choices.push({
          label: "$(check) 현재 로그인 상태 확인",
          value: "status",
          description: "✅ 로그인됨",
        });
        choices.push({
          label: "$(sign-out) 로그아웃",
          value: "logout",
          description: "",
        });
      }

      const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: isLoggedIn
          ? "✅ 로그인됨 - 옵션 선택"
          : "로그인 방법 선택",
      });

      if (!choice) {
        return;
      }

      switch (choice.value) {
        case "browser":
          await authService.openLoginInBrowser();
          break;

        case "input":
          await authService.promptForCookie();
          // 성공 시 문제 목록 새로고침
          const success = await authService.validateSession();
          if (success) {
            vscode.commands.executeCommand("programmers.refreshProblems");
          }
          break;

        case "guide":
          authService.showCookieGuide();
          break;

        case "status":
          const valid = await authService.validateSession();
          if (valid) {
            vscode.window.showInformationMessage("✅ 세션이 유효합니다.");
          } else {
            vscode.window.showWarningMessage(
              "⚠️ 세션이 만료되었습니다. 다시 로그인해주세요."
            );
          }
          break;

        case "logout":
          await authService.clearSessionCookie();
          vscode.window.showInformationMessage("로그아웃되었습니다.");
          break;
      }
    }
  );
}
