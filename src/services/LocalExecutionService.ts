import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { IOExample, Problem } from "../types/index.js";
import { SubmissionResult, TestCaseResult } from "./SubmissionService.js";

const RESULT_PREFIX = "__PROGRAMMERS_SOLVER_RESULT__";
const PROCESS_TIMEOUT_MS = 5000;
const MAX_OUTPUT_LENGTH = 128 * 1024;

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  timedOut?: boolean;
}

interface ParsedProcessResult {
  ok: boolean;
  value?: unknown;
  stdout?: string;
  error?: string;
}

interface CppParameter {
  type: string;
  name: string;
}

interface CppSignature {
  returnType: string;
  parameters: CppParameter[];
}

interface JavaScriptRunnerOptions {
  functionMode: boolean;
  args: unknown[];
}

export class LocalExecutionService {
  async run(
    problem: Problem,
    code: string,
    language: string,
    onProgress: (result: SubmissionResult) => void
  ): Promise<SubmissionResult> {
    const examples = problem.ioExamples || [];
    if (examples.length === 0) {
      return {
        status: "error",
        message: "문제에서 샘플 테스트케이스를 찾지 못했습니다.",
      };
    }

    const results: TestCaseResult[] = [];
    const totalCount = examples.length;
    const functionMode =
      problem.interfaceType !== "stdin" &&
      this.hasSolutionFunction(code, language);
    const workingDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "programmers-solver-")
    );

    onProgress({
      status: "running",
      passedCount: 0,
      totalCount,
      message: `로컬 테스트 준비 중 (${totalCount}개)`,
    });

    try {
      const runner = await this.prepareRunner(
        workingDirectory,
        code,
        language,
        functionMode,
        examples
      );

      for (let index = 0; index < examples.length; index += 1) {
        const example = examples[index];
        const startedAt = Date.now();
        const processResult = await runner(example, index);
        const testCase = this.toTestCaseResult(
          processResult,
          example,
          index,
          Date.now() - startedAt
        );
        results.push(testCase);

        const passedCount = results.filter((result) => result.passed).length;
        onProgress({
          status: "running",
          passedCount,
          totalCount,
          message: `${index + 1}/${totalCount} 테스트 완료`,
          output: testCase.stdout || testCase.stderr,
          results: [...results],
        });
      }

      const passedCount = results.filter((result) => result.passed).length;
      const passed = passedCount === totalCount;

      return {
        status: passed ? "pass" : "fail",
        passedCount,
        totalCount,
        message: `${passedCount}/${totalCount} 테스트 통과`,
        output: results.at(-1)?.stdout || results.at(-1)?.stderr,
        results,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        results,
        passedCount: results.filter((result) => result.passed).length,
        totalCount,
      };
    } finally {
      await fs.promises.rm(workingDirectory, {
        recursive: true,
        force: true,
      });
    }
  }

  private async prepareRunner(
    directory: string,
    code: string,
    language: string,
    functionMode: boolean,
    examples: IOExample[]
  ): Promise<(example: IOExample, index: number) => Promise<ProcessResult>> {
    if (language === "python3") {
      return this.preparePythonRunner(directory, code, functionMode);
    }

    if (language === "javascript") {
      return this.prepareJavaScriptRunner(directory, code, functionMode);
    }

    if (language === "java") {
      if (!functionMode) {
        throw new Error("Java의 표준 입력 방식 로컬 실행은 지원하지 않습니다.");
      }
      return this.prepareJavaRunner(directory, code);
    }

    if (language === "cpp") {
      if (!functionMode) {
        throw new Error("C++의 표준 입력 방식 로컬 실행은 지원하지 않습니다.");
      }
      return this.prepareCppRunner(directory, code, examples);
    }

    throw new Error(`로컬 실행을 지원하지 않는 언어입니다: ${language}`);
  }

  private async preparePythonRunner(
    directory: string,
    code: string,
    functionMode: boolean
  ) {
    const solutionPath = path.join(directory, "solution.py");
    await fs.promises.writeFile(solutionPath, code, "utf-8");

    if (!functionMode) {
      return (example: IOExample) =>
        this.runProcess("python3", [solutionPath], directory, `${example.input}\n`);
    }

    const runnerPath = path.join(directory, "runner.py");
    await fs.promises.writeFile(
      runnerPath,
      [
        "import contextlib",
        "import io",
        "import json",
        "import sys",
        "import traceback",
        "from solution import solution",
        "",
        "args = json.loads(sys.argv[1])",
        "captured = io.StringIO()",
        "try:",
        "    with contextlib.redirect_stdout(captured):",
        "        value = solution(*args)",
        "    result = {\"ok\": True, \"value\": value, \"stdout\": captured.getvalue()}",
        "except BaseException:",
        "    result = {\"ok\": False, \"error\": traceback.format_exc(), \"stdout\": captured.getvalue()}",
        `print(\"${RESULT_PREFIX}\" + json.dumps(result, ensure_ascii=False, default=str))`,
      ].join("\n"),
      "utf-8"
    );

    return (example: IOExample) => {
      const args = this.parseInputs(example);
      return this.runProcess(
        "python3",
        [runnerPath, JSON.stringify(args)],
        directory
      );
    };
  }

  private async prepareJavaScriptRunner(
    directory: string,
    code: string,
    functionMode: boolean
  ) {
    const solutionPath = path.join(directory, "solution.js");
    const normalizedCode = code.replace(/export\s*\{\s*\}\s*;?/g, "");
    await fs.promises.writeFile(solutionPath, normalizedCode, "utf-8");

    if (!functionMode) {
      return (example: IOExample) =>
        this.runProcess(process.execPath, [solutionPath], directory, `${example.input}\n`);
    }

    const runnerPath = path.join(directory, "runner.js");
    await fs.promises.writeFile(
      runnerPath,
      [
        "const fs = require('fs');",
        "const vm = require('vm');",
        "const args = JSON.parse(process.argv[2]);",
        "const source = fs.readFileSync(process.argv[1].replace(/runner\\.js$/, 'solution.js'), 'utf8');",
        "const output = [];",
        "const consoleProxy = {",
        "  log: (...values) => output.push(values.map(String).join(' ')),",
        "  error: (...values) => output.push(values.map(String).join(' ')),",
        "};",
        "const sandbox = { console: consoleProxy, require, process, Buffer, setTimeout, clearTimeout };",
        "try {",
        "  vm.runInNewContext(source + '\\n;globalThis.__programmers_solver_solution = solution;', sandbox, { filename: 'solution.js' });",
        "  const value = sandbox.__programmers_solver_solution(...args);",
        `  console.log('${RESULT_PREFIX}' + JSON.stringify({ ok: true, value, stdout: output.join('\\n') }));`,
        "} catch (error) {",
        `  console.log('${RESULT_PREFIX}' + JSON.stringify({ ok: false, error: error.stack || String(error), stdout: output.join('\\n') }));`,
        "}",
      ].join("\n"),
      "utf-8"
    );

    return (example: IOExample) => {
      const options: JavaScriptRunnerOptions = {
        functionMode: true,
        args: this.parseInputs(example),
      };
      return this.runProcess(
        process.execPath,
        [runnerPath, JSON.stringify(options.args)],
        directory
      );
    };
  }

  private async prepareJavaRunner(
    directory: string,
    code: string
  ): Promise<(example: IOExample, index: number) => Promise<ProcessResult>> {
    const solutionPath = path.join(directory, "Solution.java");
    const runnerPath = path.join(directory, "LocalRunner.java");
    await fs.promises.writeFile(solutionPath, code, "utf-8");
    await fs.promises.writeFile(runnerPath, JAVA_RUNNER, "utf-8");

    const compileResult = await this.runProcess(
      "javac",
      ["-encoding", "UTF-8", "-d", directory, solutionPath, runnerPath],
      directory,
      undefined,
      15000
    );

    if (compileResult.exitCode !== 0) {
      throw new Error(
        `Java 컴파일 실패\n${compileResult.stderr || compileResult.error || "알 수 없는 오류"}`
      );
    }

    return (example: IOExample) =>
      this.runProcess(
        "java",
        ["-cp", directory, "LocalRunner", JSON.stringify(this.parseInputs(example))],
        directory
      );
  }

  private async prepareCppRunner(
    directory: string,
    code: string,
    examples: IOExample[]
  ): Promise<(example: IOExample, index: number) => Promise<ProcessResult>> {
    const signature = this.parseCppSignature(code);
    if (!signature) {
      throw new Error("C++ solution 함수의 반환형과 매개변수를 찾지 못했습니다.");
    }

    const compiler = await this.findExecutable(["g++", "clang++"]);
    if (!compiler) {
      throw new Error("g++ 또는 clang++이 설치되어 있지 않습니다.");
    }

    const sourcePath = path.join(directory, "main.cpp");
    const binaryPath = path.join(directory, "runner");
    const cases = examples.map((example) => {
      const args = this.parseInputs(example);
      return signature.parameters.map((parameter, parameterIndex) =>
        this.cppLiteral(args[parameterIndex], parameter.type)
      );
    });
    const source = this.createCppRunnerSource(code, signature, cases);
    await fs.promises.writeFile(sourcePath, source, "utf-8");

    const compileResult = await this.runProcess(
      compiler,
      ["-std=c++17", sourcePath, "-o", binaryPath],
      directory,
      undefined,
      15000
    );
    if (compileResult.exitCode !== 0) {
      return () => Promise.resolve(compileResult);
    }

    return (_example: IOExample, index: number) =>
      this.runProcess(binaryPath, [String(index)], directory);
  }

  private toTestCaseResult(
    processResult: ProcessResult,
    example: IOExample,
    index: number,
    runtime: number
  ): TestCaseResult {
    const parsed = this.parseProcessResult(processResult);
    const expectedValue = this.parseLiteral(example.output);
    const output = processResult.stdout.includes(RESULT_PREFIX)
      ? (parsed.stdout || "").trim()
      : [parsed.stdout, processResult.stdout]
          .filter(
            (value, outputIndex, values) =>
              value && values.indexOf(value) === outputIndex
          )
          .join("\n")
          .trim();

    if (processResult.timedOut) {
      return {
        passed: false,
        caseNumber: index + 1,
        runtime,
        message: `실행 시간 초과 (${PROCESS_TIMEOUT_MS}ms)`,
        stdout: output,
        stderr: processResult.stderr,
        expected: this.formatValue(expectedValue),
      };
    }

    if (processResult.error || processResult.exitCode !== 0) {
      return {
        passed: false,
        caseNumber: index + 1,
        runtime,
        message: parsed.error || processResult.error || "실행 오류",
        stdout: output,
        stderr: processResult.stderr,
        expected: this.formatValue(expectedValue),
      };
    }

    if (!parsed.ok) {
      return {
        passed: false,
        caseNumber: index + 1,
        runtime,
        message: parsed.error || "실행 오류",
        stdout: output,
        stderr: processResult.stderr,
        expected: this.formatValue(expectedValue),
      };
    }

    const actualValue = Object.prototype.hasOwnProperty.call(parsed, "value")
      ? parsed.value
      : this.parseLiteral(output);
    const passed = this.valuesEqual(actualValue, expectedValue);
    return {
      passed,
      caseNumber: index + 1,
      runtime,
      message: passed ? "정답" : "기대값과 결과가 다릅니다.",
      stdout: output,
      stderr: processResult.stderr,
      expected: this.formatValue(expectedValue),
      actual: this.formatValue(actualValue),
    };
  }

  private parseProcessResult(result: ProcessResult): ParsedProcessResult {
    const markerIndex = result.stdout.lastIndexOf(RESULT_PREFIX);
    if (markerIndex < 0) {
      return {
        ok: result.exitCode === 0,
        stdout: result.stdout.trim(),
        error: result.exitCode === 0 ? undefined : result.stderr.trim(),
      };
    }

    const marker = result.stdout.slice(markerIndex + RESULT_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(marker) as ParsedProcessResult;
      return {
        ...parsed,
        stdout: [
          result.stdout.slice(0, markerIndex).trim(),
          parsed.stdout || "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    } catch {
      return {
        ok: false,
        stdout: result.stdout.slice(0, markerIndex).trim(),
        error: "실행 결과를 해석하지 못했습니다.",
      };
    }
  }

  private parseInputs(example: IOExample): unknown[] {
    const rawInputs =
      example.inputs && example.inputs.length > 0
        ? example.inputs
        : this.splitTopLevel(example.input);
    return rawInputs.map((input) => this.parseLiteral(input));
  }

  private parseLiteral(rawValue: string): unknown {
    const value = rawValue
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\u00a0/g, " ")
      .trim();

    try {
      return JSON.parse(value);
    } catch {
      const pythonString = value.replace(/'([^'\\]*)'/g, '"$1"');
      try {
        return JSON.parse(pythonString);
      } catch {
        if (value === "true") return true;
        if (value === "false") return false;
        if (value === "null") return null;
        if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
        if (/^-?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) {
          return Number.parseFloat(value);
        }
        return value;
      }
    }
  }

  private splitTopLevel(value: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = "";
        }
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if ("([{<".includes(character)) {
        depth += 1;
      } else if (")]}>".includes(character)) {
        depth = Math.max(0, depth - 1);
      } else if (character === "," && depth === 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }

    const last = value.slice(start).trim();
    if (last) {
      parts.push(last);
    }
    return parts;
  }

  private valuesEqual(actual: unknown, expected: unknown): boolean {
    if (typeof actual === "number" && typeof expected === "number") {
      return Math.abs(actual - expected) <= 1e-9;
    }
    if (Array.isArray(actual) && Array.isArray(expected)) {
      return (
        actual.length === expected.length &&
        actual.every((value, index) => this.valuesEqual(value, expected[index]))
      );
    }
    if (
      actual !== null &&
      expected !== null &&
      typeof actual === "object" &&
      typeof expected === "object"
    ) {
      const actualRecord = actual as Record<string, unknown>;
      const expectedRecord = expected as Record<string, unknown>;
      const keys = Object.keys(actualRecord);
      return (
        keys.length === Object.keys(expectedRecord).length &&
        keys.every((key) =>
          this.valuesEqual(actualRecord[key], expectedRecord[key])
        )
      );
    }
    if (typeof actual === "string" && typeof expected === "string") {
      return actual.trim() === expected.trim();
    }
    return actual === expected;
  }

  private formatValue(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private hasSolutionFunction(code: string, language: string): boolean {
    if (language === "python3") {
      return /\bdef\s+solution\s*\(/.test(code);
    }
    if (language === "javascript") {
      return /\bfunction\s+solution\s*\(|\bconst\s+solution\s*=/.test(code);
    }
    if (language === "java" || language === "cpp") {
      return /\bsolution\s*\(/.test(code);
    }
    return false;
  }

  private async runProcess(
    command: string,
    args: string[],
    cwd: string,
    input?: string,
    timeoutMs = PROCESS_TIMEOUT_MS
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        resolve({
          exitCode: null,
          stdout: "",
          stderr: "",
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve({
          exitCode: null,
          stdout,
          stderr,
          timedOut: true,
        });
      }, timeoutMs);

      const appendOutput = (current: string, chunk: Buffer) =>
        `${current}${chunk.toString("utf-8")}`.slice(-MAX_OUTPUT_LENGTH);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = appendOutput(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = appendOutput(stderr, chunk);
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode: null,
          stdout,
          stderr,
          error: error.message,
        });
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode, stdout, stderr });
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  private async findExecutable(commands: string[]): Promise<string | null> {
    const paths = (process.env.PATH || "").split(path.delimiter);
    for (const command of commands) {
      if (path.isAbsolute(command)) {
        try {
          await fs.promises.access(command, fs.constants.X_OK);
          return command;
        } catch {
          continue;
        }
      }
      for (const directory of paths) {
        const candidate = path.join(directory, command);
        try {
          await fs.promises.access(candidate, fs.constants.X_OK);
          return candidate;
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private parseCppSignature(code: string): CppSignature | null {
    const match = code.match(
      /(?:^|\n)\s*([A-Za-z_][\w:<>,\s*&]*)\s+solution\s*\(([^)]*)\)\s*\{/m
    );
    if (!match) {
      return null;
    }

    const rawParameters = this.splitTopLevel(match[2]);
    const parameters: CppParameter[] = rawParameters.map(
      (parameter, parameterIndex) => {
        const normalized = parameter.trim();
        const parameterMatch = normalized.match(
          /(.+?)([A-Za-z_]\w*)\s*$/
        );
        return {
          type: parameterMatch?.[1].trim() || normalized,
          name: parameterMatch?.[2] || `arg${parameterIndex}`,
        };
      }
    );

    return {
      returnType: match[1].trim(),
      parameters,
    };
  }

  private cppLiteral(value: unknown, type: string): string {
    const normalizedType = type
      .replace(/\bconst\b/g, "")
      .replace(/[&*]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const vectorMatch = normalizedType.match(/(?:std::)?vector\s*<(.+)>/);
    if (vectorMatch && Array.isArray(value)) {
      return `std::vector<${vectorMatch[1].trim()}>{${value
        .map((item) => this.cppLiteral(item, vectorMatch[1]))
        .join(", ")}}`;
    }
    if (normalizedType === "string" || normalizedType === "std::string") {
      return `std::string(${this.cppQuote(String(value ?? ""))})`;
    }
    if (normalizedType === "bool") {
      return value ? "true" : "false";
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return this.cppQuote(String(value ?? ""));
  }

  private cppQuote(value: string): string {
    return `"${value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")}"`;
  }

  private createCppRunnerSource(
    code: string,
    signature: CppSignature,
    cases: string[][]
  ): string {
    const renderCase = (args: string[], index: number): string => {
      const call = `solution(${args.join(", ")})`;
      const resultCode =
        signature.returnType.trim() === "void" ? `${call};` : `auto result = ${call};`;
      const valueCode =
        signature.returnType.trim() === "void" ? "printJson(nullptr);" : "printJson(result);";
      return `    case ${index}: {
      ostringstream captured;
      streambuf* original = cout.rdbuf(captured.rdbuf());
      try {
        ${resultCode}
        cout.rdbuf(original);
        cout << "${RESULT_PREFIX}{\\"ok\\":true,\\"value\\":";
        ${valueCode}
        cout << ",\\"stdout\\":" << jsonQuote(captured.str()) << "}" << endl;
      } catch (const exception& error) {
        cout.rdbuf(original);
        cout << "${RESULT_PREFIX}{\\"ok\\":false,\\"error\\":" << jsonQuote(error.what())
             << ",\\"stdout\\":" << jsonQuote(captured.str()) << "}" << endl;
      }
      break;
    }`;
    };

    return `#include <cstddef>
#include <exception>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

${code}

string jsonQuote(const string& value) {
  string result = "\\\"";
  for (char character : value) {
    if (character == '\\\\') result += "\\\\\\\\";
    else if (character == '\\\"') result += "\\\\\\\"";
    else if (character == '\\n') result += "\\\\n";
    else result += character;
  }
  return result + "\\\"";
}

void printJson(nullptr_t) { cout << "null"; }
void printJson(bool value) { cout << (value ? "true" : "false"); }
void printJson(const string& value) { cout << jsonQuote(value); }
void printJson(const char* value) { printJson(string(value)); }
template <typename T> void printJson(const vector<T>& values) {
  cout << "[";
  for (size_t index = 0; index < values.size(); index += 1) {
    if (index > 0) cout << ",";
    printJson(values[index]);
  }
  cout << "]";
}
template <typename T> void printJson(const T& value) { cout << value; }

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  switch (stoi(argv[1])) {
${cases.map((args, index) => renderCase(args, index)).join("\n")}
    default:
      return 2;
  }
  return 0;
}
`;
  }
}

const JAVA_RUNNER = String.raw`
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.List;

public class LocalRunner {
    private static final String PREFIX = "${RESULT_PREFIX}";

    public static void main(String[] arguments) {
        PrintStream originalOut = System.out;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        try {
            Object rawArguments = new JsonParser(arguments[0]).parse();
            Class<?> solutionClass = Class.forName("Solution");
            Constructor<?> constructor = solutionClass.getDeclaredConstructor();
            constructor.setAccessible(true);
            Object solution = constructor.newInstance();
            Method method = null;
            for (Method candidate : solutionClass.getDeclaredMethods()) {
                if (candidate.getName().equals("solution")) {
                    method = candidate;
                    break;
                }
            }
            if (method == null) throw new IllegalStateException("solution 메서드를 찾지 못했습니다.");
            method.setAccessible(true);
            List<?> values = (List<?>) rawArguments;
            Class<?>[] types = method.getParameterTypes();
            Object[] converted = new Object[types.length];
            for (int index = 0; index < types.length; index++) {
                converted[index] = convert(values.get(index), types[index]);
            }

            System.setOut(new PrintStream(captured));
            Object value = method.invoke(solution, converted);
            System.setOut(originalOut);
            System.out.println(PREFIX + "{\"ok\":true,\"value\":" + toJson(value)
                    + ",\"stdout\":" + quote(captured.toString()) + "}");
        } catch (Throwable error) {
            System.setOut(originalOut);
            Throwable cause = error instanceof InvocationTargetException && error.getCause() != null
                    ? error.getCause() : error;
            System.out.println(PREFIX + "{\"ok\":false,\"error\":" + quote(stackTrace(cause))
                    + ",\"stdout\":" + quote(captured.toString()) + "}");
        }
    }

    private static Object convert(Object value, Class<?> type) {
        if (value == null) return null;
        if (type.isArray()) {
            List<?> values = (List<?>) value;
            Object result = Array.newInstance(type.getComponentType(), values.size());
            for (int index = 0; index < values.size(); index++) {
                Array.set(result, index, convert(values.get(index), type.getComponentType()));
            }
            return result;
        }
        if (type == String.class) return String.valueOf(value);
        if (type == int.class || type == Integer.class) return ((Number) value).intValue();
        if (type == long.class || type == Long.class) return ((Number) value).longValue();
        if (type == double.class || type == Double.class) return ((Number) value).doubleValue();
        if (type == float.class || type == Float.class) return ((Number) value).floatValue();
        if (type == short.class || type == Short.class) return ((Number) value).shortValue();
        if (type == byte.class || type == Byte.class) return ((Number) value).byteValue();
        if (type == boolean.class || type == Boolean.class) return value;
        if (type == char.class || type == Character.class) return String.valueOf(value).charAt(0);
        return value;
    }

    private static String toJson(Object value) {
        if (value == null) return "null";
        if (value instanceof String || value instanceof Character) return quote(String.valueOf(value));
        if (value instanceof Boolean || value instanceof Number) return String.valueOf(value);
        if (value.getClass().isArray()) {
            StringBuilder result = new StringBuilder("[");
            for (int index = 0; index < Array.getLength(value); index++) {
                if (index > 0) result.append(',');
                result.append(toJson(Array.get(value, index)));
            }
            return result.append(']').toString();
        }
        if (value instanceof Iterable<?>) {
            StringBuilder result = new StringBuilder("[");
            int index = 0;
            for (Object item : (Iterable<?>) value) {
                if (index++ > 0) result.append(',');
                result.append(toJson(item));
            }
            return result.append(']').toString();
        }
        return quote(String.valueOf(value));
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static String stackTrace(Throwable error) {
        java.io.StringWriter writer = new java.io.StringWriter();
        error.printStackTrace(new java.io.PrintWriter(writer));
        return writer.toString();
    }

    private static class JsonParser {
        private final String source;
        private int index = 0;

        JsonParser(String source) { this.source = source; }

        Object parse() {
            skipWhitespace();
            char current = source.charAt(index);
            if (current == '[') return parseArray();
            if (current == '"') return parseString();
            if (current == 't') { index += 4; return true; }
            if (current == 'f') { index += 5; return false; }
            if (current == 'n') { index += 4; return null; }
            return parseNumber();
        }

        private List<Object> parseArray() {
            List<Object> values = new ArrayList<>();
            index++;
            skipWhitespace();
            if (source.charAt(index) == ']') { index++; return values; }
            while (true) {
                values.add(parse());
                skipWhitespace();
                if (source.charAt(index) == ']') { index++; return values; }
                index++;
                skipWhitespace();
            }
        }

        private String parseString() {
            StringBuilder value = new StringBuilder();
            index++;
            while (source.charAt(index) != '"') {
                char current = source.charAt(index++);
                if (current == '\\') {
                    char escaped = source.charAt(index++);
                    value.append(escaped == 'n' ? '\n' : escaped == 'r' ? '\r' : escaped);
                } else {
                    value.append(current);
                }
            }
            index++;
            return value.toString();
        }

        private Number parseNumber() {
            int start = index;
            while (index < source.length() && "-+.0123456789eE".indexOf(source.charAt(index)) >= 0) index++;
            String value = source.substring(start, index);
            return value.contains(".") || value.contains("e") || value.contains("E")
                    ? Double.parseDouble(value) : Long.parseLong(value);
        }

        private void skipWhitespace() {
            while (index < source.length() && Character.isWhitespace(source.charAt(index))) index++;
        }
    }
}
`;
