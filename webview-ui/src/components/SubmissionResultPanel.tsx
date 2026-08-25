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

export interface SubmissionStatus {
  operation: "run" | "submit";
  status: "running" | "pass" | "fail" | "error";
  message?: string;
  output?: string;
  details?: {
    passedCount?: number;
    totalCount?: number;
    results?: SubmissionTestCase[];
  };
}

const operationLabels = {
  run: "SAMPLE RUN",
  submit: "FULL SUBMISSION",
};

const statusLabels = {
  running: "진행 중",
  pass: "통과",
  fail: "실패",
  error: "오류",
};

function TestCaseRow({
  testCase,
  index,
}: {
  testCase: SubmissionTestCase;
  index: number;
}) {
  const output = testCase.stdout || testCase.stderr;
  const hasValues =
    testCase.expected !== undefined || testCase.actual !== undefined;

  return (
    <div className={`testcase-row ${testCase.passed ? "case-pass" : "case-fail"}`}>
      <span className="testcase-mark" aria-label={testCase.passed ? "통과" : "실패"}>
        {testCase.passed ? "✓" : "×"}
      </span>
      <div className="testcase-copy">
        <div className="testcase-title">
          <span>TEST {String(testCase.caseNumber ?? index + 1).padStart(2, "0")}</span>
          {testCase.runtime !== undefined && <em>{testCase.runtime}ms</em>}
          {testCase.memory !== undefined && <em>{testCase.memory}MB</em>}
        </div>
        {testCase.message && <p className="testcase-message">{testCase.message}</p>}
        {hasValues && (
          <div className="testcase-values">
            {testCase.expected !== undefined && (
              <span>
                expected <code>{testCase.expected}</code>
              </span>
            )}
            {testCase.actual !== undefined && (
              <span>
                actual <code>{testCase.actual}</code>
              </span>
            )}
          </div>
        )}
        {output && <pre className="testcase-output">{output}</pre>}
      </div>
    </div>
  );
}

export function SubmissionResultPanel({
  status,
}: {
  status: SubmissionStatus;
}) {
  const details = status.details;
  const results = details?.results || [];
  const passedCount = details?.passedCount ?? 0;
  const totalCount = details?.totalCount;

  return (
    <section className={`result-card result-${status.status}`} aria-live="polite">
      <div className="result-header">
        <div>
          <p className="section-kicker">{operationLabels[status.operation]}</p>
          <h2>채점 결과</h2>
        </div>
        <span className="result-badge">
          <span className="result-dot" />
          {statusLabels[status.status]}
        </span>
      </div>

      <div className="score-strip">
        <strong>{passedCount}</strong>
        <span>/ {totalCount ?? "—"} TESTS PASSED</span>
      </div>

      {status.message && <p className="result-message">{status.message}</p>}
      {status.output && <pre className="result-output">{status.output}</pre>}

      {results.length > 0 && (
        <div className="testcase-list">
          {results.map((testCase, index) => (
            <TestCaseRow
              key={`${testCase.caseNumber ?? index}-${index}`}
              testCase={testCase}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
