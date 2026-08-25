import assert from "node:assert/strict";
import test from "node:test";
import { SolutionContextService } from "../out/services/SolutionContextService.js";

test("solution context maps problem files and strips TypeScript for submission", () => {
  const service = new SolutionContextService();
  const context = service.fromDocument(
    "/workspace/problems/P_1234_Title/solution.ts",
    "// ChallengeableId: 9\n// SolutionId: code-1\nfunction solution(value: number): number { return value; }\nexport {};"
  );

  assert.equal(context?.lessonId, 1234);
  assert.equal(context?.language, "javascript");
  assert.equal(context?.challengeableId, 9);
  assert.equal(context?.solutionId, "code-1");
  assert.match(context?.codeForSubmit || "", /function solution\(value\)/);
  assert.doesNotMatch(context?.codeForSubmit || "", /ChallengeableId/);
  assert.doesNotMatch(context?.codeForSubmit || "", /export/);
});

test("solution context rejects non-Programmers files and unsupported languages", () => {
  const service = new SolutionContextService();
  assert.equal(service.fromDocument("/workspace/solution.py", ""), null);
  assert.equal(
    service.fromDocument("/workspace/problems/P_1_Title/solution.rb", ""),
    null
  );
});
