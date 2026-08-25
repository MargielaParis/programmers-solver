import * as vscode from "vscode";
import { CommandController } from "./commands/CommandController.js";
import { ProblemTreeProvider } from "./providers/ProblemTreeProvider.js";
import { ProblemWebviewProvider } from "./providers/ProblemWebviewProvider.js";
import { AuthService } from "./services/AuthService.js";
import { FileService } from "./services/FileService.js";
import { LocalExecutionService } from "./services/LocalExecutionService.js";
import { ProblemRepository } from "./services/ProblemRepository.js";
import { ScrapingService } from "./services/ScrapingService.js";
import { SubmissionService } from "./services/SubmissionService.js";
import Logger from "./utils/Logger.js";

export function activate(context: vscode.ExtensionContext): void {
  Logger.init();
  Logger.log("ProgrammersSolver is active");

  const authService = new AuthService(context);
  const scrapingService = new ScrapingService(authService);
  const problemRepository = new ProblemRepository(scrapingService);
  const fileService = new FileService();
  const localExecutionService = new LocalExecutionService();
  const submissionService = new SubmissionService(authService);
  const problemTreeProvider = new ProblemTreeProvider(problemRepository);
  const problemWebviewProvider = new ProblemWebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("programmers-view", problemTreeProvider),
    vscode.window.registerWebviewViewProvider(
      ProblemWebviewProvider.viewType,
      problemWebviewProvider
    ),
    { dispose: () => authService.dispose() }
  );

  new CommandController(
    authService,
    problemRepository,
    problemTreeProvider,
    problemWebviewProvider,
    fileService,
    localExecutionService,
    submissionService
  ).register(context);
}

export function deactivate(): void {
  Logger.log("ProgrammersSolver is deactivated");
}
