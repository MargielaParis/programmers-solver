import * as vscode from "vscode";
import { registerSetSessionCookieCommand } from "./setSessionCookie.js";
import { ProblemTreeProvider } from "../providers/ProblemTreeProvider.js";
import { ProblemWebviewProvider } from "../providers/ProblemWebviewProvider.js";
import { AuthService } from "../services/AuthService.js";
import { FileService } from "../services/FileService.js";
import { LocalExecutionService } from "../services/LocalExecutionService.js";
import { ProblemRepository } from "../services/ProblemRepository.js";
import { SolutionContextService } from "../services/SolutionContextService.js";
import { SubmissionService } from "../services/SubmissionService.js";
import {
  Problem,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from "../types/index.js";

export class CommandController {
  private readonly solutionContext = new SolutionContextService();

  constructor(
    private readonly authService: AuthService,
    private readonly problemRepository: ProblemRepository,
    private readonly problemTreeProvider: ProblemTreeProvider,
    private readonly problemWebviewProvider: ProblemWebviewProvider,
    private readonly fileService: FileService,
    private readonly localExecutionService: LocalExecutionService,
    private readonly submissionService: SubmissionService
  ) {}

  register(context: vscode.ExtensionContext): void {
    const disposables: vscode.Disposable[] = [
      registerSetSessionCookieCommand(context, this.authService),
      this.registerRefreshProblems(),
      this.registerPageSelection(),
      ...this.registerPaging(),
      ...this.registerFilters(),
      this.registerOpenProblem(),
      this.registerTypeScriptToggle(),
      this.registerSubmitCode(),
      this.registerRunCode(),
      vscode.commands.registerCommand("programmers.toggleProblemPanel", () =>
        vscode.commands.executeCommand("programmers.problemView.focus")
      ),
      this.authService.onDidChangeSession(() => this.problemRepository.clear()),
      { dispose: () => this.submissionService.dispose() },
    ];
    context.subscriptions.push(...disposables);
  }

  private registerRefreshProblems(): vscode.Disposable {
    return vscode.commands.registerCommand("programmers.refreshProblems", async () => {
      if (!(await this.authService.getSessionCookie())) {
        const action = await vscode.window.showWarningMessage(
          "세션 쿠키가 설정되지 않았습니다.",
          "쿠키 설정하기"
        );
        if (action === "쿠키 설정하기") {
          await vscode.commands.executeCommand("programmers.setSessionCookie");
        }
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "문제 목록을 불러오는 중...",
        },
        () => this.problemTreeProvider.refresh()
      );
    });
  }

  private registerPageSelection(): vscode.Disposable {
    return vscode.commands.registerCommand(
      "programmers.selectPage",
      async (currentPage: number, totalPages: number) => {
        const input = await vscode.window.showInputBox({
          prompt: `페이지 번호 입력 (1 - ${totalPages})`,
          value: String(currentPage),
          validateInput: (value) => {
            const page = Number.parseInt(value, 10);
            return Number.isInteger(page) && page >= 1 && page <= totalPages
              ? null
              : `1에서 ${totalPages} 사이의 숫자를 입력하세요`;
          },
        });
        if (input) {
          await this.problemTreeProvider.goToPage(Number.parseInt(input, 10));
        }
      }
    );
  }

  private registerPaging(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("programmers.nextPage", () =>
        this.problemTreeProvider.nextPage()
      ),
      vscode.commands.registerCommand("programmers.prevPage", () =>
        this.problemTreeProvider.prevPage()
      ),
    ];
  }

  private registerFilters(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("programmers.filterByLevel", async () => {
        const current = this.problemTreeProvider.getFilter();
        const levels = [0, 1, 2, 3, 4, 5].map((value) => ({
          label: `Lv.${value}`,
          value,
          picked: current.levels.includes(value),
        }));
        const selected = await vscode.window.showQuickPick(levels, {
          canPickMany: true,
          placeHolder: "표시할 레벨 선택",
        });
        if (selected?.length) {
          await this.problemTreeProvider.setLevelFilter(
            selected.map((item) => item.value)
          );
        }
      }),
      vscode.commands.registerCommand("programmers.filterByStatus", async () => {
        const current = this.problemTreeProvider.getFilter();
        const statuses = [
          { label: "미해결", value: "unsolved" },
          { label: "풀이 중", value: "solving" },
          { label: "해결", value: "solved" },
        ].map((item) => ({ ...item, picked: current.statuses.includes(item.value) }));
        const selected = await vscode.window.showQuickPick(statuses, {
          canPickMany: true,
          placeHolder: "표시할 상태 선택",
        });
        if (selected?.length) {
          await this.problemTreeProvider.setStatusFilter(
            selected.map((item) => item.value)
          );
        }
      }),
      vscode.commands.registerCommand("programmers.filterByLanguage", async () => {
        const config = vscode.workspace.getConfiguration("programmers");
        const current = this.selectedLanguage();
        const selected = await vscode.window.showQuickPick(
          SUPPORTED_LANGUAGES.map((language) => ({
            label: language.label,
            value: language.id,
            description: language.id === current ? "현재 선택됨" : undefined,
          })),
          { placeHolder: "사용할 언어 선택" }
        );
        if (selected) {
          await config.update(
            "filter.language",
            selected.value,
            vscode.ConfigurationTarget.Global
          );
          await this.problemTreeProvider.refresh();
          vscode.window.showInformationMessage(
            `언어가 ${selected.label}(으)로 설정되었습니다.`
          );
        }
      }),
    ];
  }

  private registerOpenProblem(): vscode.Disposable {
    return vscode.commands.registerCommand(
      "programmers.openProblem",
      async (problem: Problem) => {
        const language = this.selectedLanguage();
        this.problemWebviewProvider.loadProblem(problem);

        try {
          const detailedProblem = await this.problemRepository.fetchProblemDetail(
            problem.id,
            language
          );
          if (detailedProblem) {
            this.problemWebviewProvider.loadProblem(detailedProblem);
            await this.fileService.createProblemFile(detailedProblem, language);
          } else {
            await this.fileService.createProblemFile(problem, language);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `문제 정보를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );
  }

  private registerTypeScriptToggle(): vscode.Disposable {
    return vscode.commands.registerCommand(
      "programmers.toggleTypeScript",
      async () => {
        const config = vscode.workspace.getConfiguration("programmers");
        const current = config.get<boolean>("useTypeScript", false);
        await config.update(
          "useTypeScript",
          !current,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(
          `파일 생성 모드: ${current ? "JavaScript" : "TypeScript"}`
        );
      }
    );
  }

  private registerSubmitCode(): vscode.Disposable {
    return vscode.commands.registerCommand("programmers.submitCode", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("열린 파일이 없습니다.");
        return;
      }

      const context = this.solutionContext.fromDocument(
        editor.document.fileName,
        editor.document.getText()
      );
      if (!context) {
        vscode.window.showWarningMessage(
          "프로그래머스 문제 파일이 아니거나 지원하지 않는 언어입니다."
        );
        return;
      }

      const problem = await this.problemRepository.fetchProblemDetail(
        String(context.lessonId),
        context.language
      );
      const challengeableId = context.challengeableId ?? problem?.challengeableId;
      const solutionId = context.solutionId ?? problem?.solutionId;
      if (!challengeableId || !solutionId) {
        vscode.window.showErrorMessage(
          "제출에 필요한 정보를 찾을 수 없습니다. 문제를 다시 열어주세요."
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "코드 제출 중...",
        },
        async (progress) => {
          this.problemWebviewProvider.updateSubmissionStatus("submit", {
            status: "running",
            message: "채점 요청을 전송하는 중...",
          });

          const result = await this.submissionService.submitCode(
            context.lessonId,
            challengeableId,
            solutionId,
            context.codeForSubmit,
            context.language,
            (update) => {
              this.problemWebviewProvider.updateSubmissionStatus("submit", update);
              if (update.status === "running") progress.report({ message: "채점 중..." });
            }
          );
          this.problemWebviewProvider.updateSubmissionStatus("submit", result);
          this.notifyOperationResult(result.status, result.message, "제출");
        }
      );
    });
  }

  private registerRunCode(): vscode.Disposable {
    return vscode.commands.registerCommand("programmers.runCode", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("열린 파일이 없습니다.");
        return;
      }

      const context = this.solutionContext.fromDocument(
        editor.document.fileName,
        editor.document.getText()
      );
      if (!context) {
        vscode.window.showErrorMessage(
          "프로그래머스 문제 파일이 아니거나 지원하지 않는 언어입니다."
        );
        return;
      }

      const problem = await this.problemRepository.fetchProblemDetail(
        String(context.lessonId),
        context.language
      );
      if (!problem?.templateCode || !problem.ioExamples?.length) {
        vscode.window.showErrorMessage(
          "웹 템플릿 또는 샘플 테스트케이스를 가져오지 못했습니다. 세션 쿠키와 문제 페이지를 확인해주세요."
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "코드 실행 중...",
        },
        async (progress) => {
          this.problemWebviewProvider.updateSubmissionStatus("run", {
            status: "running",
            message: "테스트 실행을 준비하는 중...",
          });

          const result = await this.localExecutionService.run(
            problem,
            context.codeForRun,
            context.language,
            (update) => {
              this.problemWebviewProvider.updateSubmissionStatus("run", update);
              if (update.status === "running") progress.report({ message: "로컬 테스트 중..." });
            }
          );
          this.problemWebviewProvider.updateSubmissionStatus("run", result);
          this.notifyOperationResult(result.status, result.message, "실행");
        }
      );
    });
  }

  private selectedLanguage(): SupportedLanguage {
    const configured = vscode.workspace
      .getConfiguration("programmers")
      .get<string>("filter.language", "javascript");
    return SUPPORTED_LANGUAGES.some((language) => language.id === configured)
      ? (configured as SupportedLanguage)
      : "javascript";
  }

  private notifyOperationResult(
    status: "pending" | "running" | "pass" | "fail" | "error",
    message: string | undefined,
    operation: string
  ): void {
    if (status === "pass") {
      vscode.window.showInformationMessage(`${operation} 완료: ${message || "통과"}`);
    } else if (status === "fail") {
      vscode.window.showWarningMessage(`${operation} 실패: ${message || "테스트 실패"}`);
    } else if (status === "error") {
      vscode.window.showErrorMessage(`${operation} 오류: ${message || "알 수 없는 오류"}`);
    }
  }
}
