// 타입 정의

/**
 * 문제 정보
 */
export interface Problem {
  id: string;
  title: string;
  level: number; // 0~5
  isSolved: boolean;
  link: string;
  challengeableId?: number; // WebSocket 제출에 필요
  solutionId?: string; // codes 객체의 키로 사용
  descriptionHtml?: string;
  templateCode?: string;
  constraints?: string[];
  ioExamples?: IOExample[];
  interfaceType?: "function" | "stdin";
  parameterNames?: string[];
}

export type SupportedLanguage = "javascript" | "python3" | "java" | "cpp";

export const SUPPORTED_LANGUAGES: ReadonlyArray<{
  id: SupportedLanguage;
  label: string;
}> = [
  { id: "javascript", label: "JavaScript" },
  { id: "python3", label: "Python3" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
];

export interface IOExample {
  input: string;
  output: string;
  inputs?: string[];
}

/**
 * 웹뷰 메시지 통신 타입
 */
export type WebviewToExtensionMessage =
  | { command: "READY" }
  | { command: "RUN_CODE" }
  | { command: "SUBMIT_CODE" };

export type ExtensionToWebviewMessage = {
  command: "SYNC_STATE";
  payload: {
    problem?: ProblemViewPayload;
    submissionStatus?: SubmissionStatusPayload;
  };
};

export type WebviewMessage = WebviewToExtensionMessage | ExtensionToWebviewMessage;

export interface LoadProblemPayload {
  id: string;
  title: string;
  descriptionHtml: string;
  constraints: string[];
  ioExamples: IOExample[];
}

export interface ProblemViewPayload extends Problem {
  imageSettings: {
    grayscale: boolean;
    opacity: number;
    hoverRestore: boolean;
  };
}

export interface SubmissionStatusPayload {
  operation: "run" | "submit";
  status: "running" | "pass" | "fail" | "error";
  message?: string;
  output?: string;
  details?: SubmissionDetails;
}

export interface SubmissionDetails {
  passedCount?: number;
  totalCount?: number;
  failedCases?: FailedCase[];
  results?: SubmissionTestCase[];
}

export interface SubmissionTestCase {
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

export interface FailedCase {
  caseNumber: number;
  expected?: string;
  actual?: string;
}

/**
 * Extension 설정
 */
export interface ExtensionConfig {
  sessionCookie: string;
  defaultLanguage: "javascript" | "python3" | "cpp" | "java";
  showSolvedProblems: boolean;
  filterLevels: number[];
}

/**
 * 언어별 파일 확장자 매핑
 */
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  python3: "py",
  java: "java",
  cpp: "cpp",
};

/**
 * 언어별 주석 스타일
 */
export const LANGUAGE_COMMENTS: Record<
  string,
  { start: string; end?: string }
> = {
  javascript: { start: "//" },
  python3: { start: "#" },
  java: { start: "//" },
  cpp: { start: "//" },
};
