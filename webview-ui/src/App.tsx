import { useCallback, useEffect, useState } from "preact/hooks";
import {
  SubmissionResultPanel,
  SubmissionStatus,
} from "./components/SubmissionResultPanel";
import "./styles/claude-theme.css";

interface VsCodeApi {
  postMessage: (message: WebviewCommand) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

interface WebviewCommand {
  command: "READY" | "RUN_CODE" | "SUBMIT_CODE";
}

interface Problem {
  id: string;
  title: string;
  level: number;
  descriptionHtml?: string;
  constraints?: string[];
  ioExamples?: Array<{ input: string; output: string; inputs?: string[] }>;
  imageSettings?: {
    grayscale: boolean;
    opacity: number;
    hoverRestore: boolean;
  };
}

interface SyncState {
  problem?: Problem;
  submissionStatus?: SubmissionStatus;
}

interface ExtensionMessage {
  command: "SYNC_STATE";
  payload: SyncState;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();

function App() {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus | null>(null);
  const isBusy = submissionStatus?.status === "running";

  const executeCommand = (command: "RUN_CODE" | "SUBMIT_CODE") => {
    vscode.postMessage({ command });
  };

  const applyImageSettings = (settings?: Problem["imageSettings"]) => {
    if (!settings) return;
    const root = document.documentElement;
    root.style.setProperty(
      "--problem-image-filter",
      settings.grayscale
        ? "saturate(0.24) brightness(0.82) contrast(0.96)"
        : "none"
    );
    root.style.setProperty("--problem-image-opacity", String(settings.opacity));
    root.style.setProperty(
      "--problem-image-hover-filter",
      settings.hoverRestore ? "none" : "var(--problem-image-filter)"
    );
    root.style.setProperty(
      "--problem-image-hover-opacity",
      settings.hoverRestore ? "1" : "var(--problem-image-opacity)"
    );
  };

  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;
    if (!message || message.command !== "SYNC_STATE") return;
    const nextProblem = message.payload.problem ?? null;
    setProblem(nextProblem);
    setSubmissionStatus(message.payload.submissionStatus ?? null);
    applyImageSettings(nextProblem?.imageSettings);
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ command: "READY" });
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const status = submissionStatus?.status ?? "idle";

  return (
    <main className="bench-shell">
      <header className="bench-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <p className="brand-name">ProgrammersSolver</p>
            <p className="brand-caption">local test bench</p>
          </div>
        </div>
        <div className={`signal-rail signal-${status}`} aria-label={`상태: ${status}`}>
          <span className="signal-node" />
          <span className="signal-line" />
          <span className="signal-node" />
          <span className="signal-line" />
          <span className="signal-node" />
        </div>
      </header>

      {!problem ? (
        <section className="empty-bench" aria-live="polite">
          <div className="empty-grid" aria-hidden="true" />
          <p className="section-kicker">READY / SELECT A PROBLEM</p>
          <h1>문제를 고르면<br />테스트 벤치가 준비됩니다.</h1>
          <p className="empty-copy">
            왼쪽 문제 목록에서 문제를 선택하면 웹 템플릿과 샘플 테스트가 이곳에
            표시됩니다.
          </p>
        </section>
      ) : (
        <>
          <section className="problem-card">
            <div className="problem-topline">
              <span className="section-kicker">PROBLEM / {problem.id}</span>
              <span className="level-chip">LV.{problem.level}</span>
            </div>
            <h1>{problem.title}</h1>
            <div
              className="problem-description"
              dangerouslySetInnerHTML={{
                __html: problem.descriptionHtml || "<p>문제 설명이 없습니다.</p>",
              }}
            />

            {(problem.constraints?.length || problem.ioExamples?.length) ? (
              <div className="problem-data-grid">
                {problem.constraints && problem.constraints.length > 0 && (
                  <div className="data-block">
                    <p className="data-label">CONSTRAINTS</p>
                    <ul>
                      {problem.constraints.map((constraint) => (
                        <li key={constraint}>{constraint}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {problem.ioExamples && problem.ioExamples.length > 0 && (
                  <div className="data-block examples-block">
                    <p className="data-label">SAMPLE I/O</p>
                    <div className="example-stack">
                      {problem.ioExamples.map((example, index) => (
                        <div className="example-row" key={`${example.input}-${index}`}>
                          <span className="example-index">0{index + 1}</span>
                          <code>{example.input}</code>
                          <span className="example-arrow">→</span>
                          <code>{example.output}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className="action-dock" aria-label="문제 코드 작업">
            <div>
              <p className="section-kicker">CODE OPERATIONS</p>
              <p className="action-copy">현재 열린 solution 파일을 기준으로 실행합니다.</p>
            </div>
            <div className="action-buttons">
              <button
                type="button"
                className="bench-button run-button"
                onClick={() => executeCommand("RUN_CODE")}
                disabled={isBusy}
              >
                <span className="button-icon play-icon" aria-hidden="true" />
                <span>{isBusy ? "실행 중" : "Run Code"}</span>
              </button>
              <button
                type="button"
                className="bench-button submit-button"
                onClick={() => executeCommand("SUBMIT_CODE")}
                disabled={isBusy}
              >
                <span className="button-icon upload-icon" aria-hidden="true" />
                <span>{isBusy ? "채점 중" : "Submit Code"}</span>
              </button>
            </div>
          </section>

          {submissionStatus ? (
            <SubmissionResultPanel status={submissionStatus} />
          ) : (
            <section className="result-placeholder">
              <span className="placeholder-led" aria-hidden="true" />
              <div>
                <p className="data-label">VERDICT CHANNEL</p>
                <p>Run Code를 누르면 샘플 테스트 결과가 여기에 쌓입니다.</p>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default App;
