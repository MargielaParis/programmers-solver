import * as vscode from "vscode";

/**
 * 전역 Output Channel 로거
 */
class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;

  static init() {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel("ProgrammersSolver");
    }
  }

  static log(...args: unknown[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(" ");

    const timestamp = new Date().toISOString();
    this.outputChannel?.appendLine(`[${timestamp}] ${message}`);
    console.log(...args);
  }

  static error(...args: unknown[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(" ");

    const timestamp = new Date().toISOString();
    this.outputChannel?.appendLine(`[${timestamp}] ❌ ERROR: ${message}`);
    console.error(...args);
  }

  static show() {
    this.outputChannel?.show();
  }

  static dispose() {
    this.outputChannel?.dispose();
    this.outputChannel = null;
  }
}

export default Logger;
