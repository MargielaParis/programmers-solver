import * as path from "path";
import {
  LANGUAGE_EXTENSIONS,
  Problem,
  SupportedLanguage,
} from "../types/index.js";

export interface SolutionContext {
  lessonId: number;
  language: SupportedLanguage;
  extension: string;
  code: string;
  codeForRun: string;
  codeForSubmit: string;
  challengeableId?: number;
  solutionId?: string;
}

export class SolutionContextService {
  fromDocument(fileName: string, source: string): SolutionContext | null {
    const lessonIdMatch = fileName.match(/P_(\d+)_/);
    if (!lessonIdMatch) {
      return null;
    }

    const extension = path.extname(fileName).slice(1).toLowerCase();
    const language = this.languageFromExtension(extension);
    if (!language) {
      return null;
    }

    const normalizedCode = extension === "ts" ? this.stripTypeScript(source) : source;
    const codeWithoutExports = normalizedCode
      .replace(/export\s*\{\s*\}\s*;?\s*$/gm, "")
      .trim();

    return {
      lessonId: Number.parseInt(lessonIdMatch[1], 10),
      language,
      extension,
      code: source,
      codeForRun: codeWithoutExports,
      codeForSubmit: this.stripMetadata(codeWithoutExports),
      challengeableId: this.readNumberMetadata(source, "ChallengeableId"),
      solutionId: this.readStringMetadata(source, "SolutionId"),
    };
  }

  languageFromExtension(extension: string): SupportedLanguage | null {
    switch (extension.toLowerCase()) {
      case "js":
      case "ts":
        return "javascript";
      case "py":
        return "python3";
      case "java":
        return "java";
      case "cpp":
        return "cpp";
      default:
        return null;
    }
  }

  extensionForLanguage(language: SupportedLanguage, useTypeScript = false): string {
    if (language === "javascript" && useTypeScript) {
      return "ts";
    }
    return LANGUAGE_EXTENSIONS[language];
  }

  stripTypeScript(source: string): string {
    return source
      .replace(/:\s*\w+(\[\])?(\s*[,)=])/g, "$2")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+as\s+\w+/g, "")
      .replace(/^(interface|type)\s+\w+\s*=?\s*\{[\s\S]*?\};?\s*$/gm, "")
      .replace(/\)\s*:\s*\w+(\[\])?\s*\{/g, ") {");
  }

  stripMetadata(source: string): string {
    return source
      .replace(/^(\/\/|#).*\n/gm, "")
      .replace(/^\s*$/gm, "")
      .trim();
  }

  createFileMetadata(problem: Problem, language: SupportedLanguage): string[] {
    const comment = language === "python3" ? "#" : "//";
    const lines = [
      `${comment} [P_${problem.id}] ${problem.title}`,
      `${comment} ${problem.link}`,
      `${comment} Level: ${problem.level}`,
    ];

    if (problem.challengeableId) {
      lines.push(`${comment} ChallengeableId: ${problem.challengeableId}`);
    }
    if (problem.solutionId) {
      lines.push(`${comment} SolutionId: ${problem.solutionId}`);
    }
    lines.push("");
    return lines;
  }

  private readNumberMetadata(source: string, key: string): number | undefined {
    const match = source.match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  private readStringMetadata(source: string, key: string): string | undefined {
    const match = source.match(new RegExp(`${key}\\s*:\\s*([\\w-]+)`));
    return match?.[1];
  }
}
