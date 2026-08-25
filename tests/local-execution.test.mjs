import assert from "node:assert/strict";
import test from "node:test";
import { LocalExecutionService } from "../out/services/LocalExecutionService.js";

const service = new LocalExecutionService();

const problem = (language, ioExamples) => ({
  id: "fixture",
  title: `${language} fixture`,
  level: 1,
  isSolved: false,
  link: "",
  templateCode: "",
  interfaceType: "function",
  ioExamples,
});

const run = (currentProblem, code, language) =>
  service.run(currentProblem, code, language, () => {});

test("local execution supports JavaScript, Python3, Java, and C++", async () => {
  const cases = [
    [
      "javascript",
      "function solution(value) { return value * 2; }",
      problem("javascript", [
        { input: "2", inputs: ["2"], output: "4" },
        { input: "5", inputs: ["5"], output: "10" },
      ]),
    ],
    [
      "python3",
      "def solution(value):\n    return value * 2",
      problem("python3", [
        { input: "2", inputs: ["2"], output: "4" },
        { input: "5", inputs: ["5"], output: "10" },
      ]),
    ],
    [
      "java",
      "class Solution { public int solution(int value) { return value * 2; } }",
      problem("java", [
        { input: "2", inputs: ["2"], output: "4" },
        { input: "5", inputs: ["5"], output: "10" },
      ]),
    ],
    [
      "cpp",
      "int solution(int value) { return value * 2; }",
      problem("cpp", [
        { input: "2", inputs: ["2"], output: "4" },
        { input: "5", inputs: ["5"], output: "10" },
      ]),
    ],
  ];

  for (const [language, code, currentProblem] of cases) {
    const result = await run(currentProblem, code, language);
    assert.equal(result.status, "pass", language);
    assert.equal(result.passedCount, 2, language);
    assert.equal(result.totalCount, 2, language);
  }
});
