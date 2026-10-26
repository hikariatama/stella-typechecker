import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

export interface ErrorExpectation {
  type: "error";
  codes: string[];
  line?: number;
  col?: number;
}

export interface SuccessExpectation {
  type: "success";
}

export type TestExpectation = ErrorExpectation | SuccessExpectation;

export interface TestResultData {
  name: string;
  status: "pass" | "fail" | "skip";
  reason?: string;
}

export interface ParsedTypecheckerOutput {
  errorCodes: string[];
  source?: {
    line: number;
    col: number;
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function getStellaTestsDir(): string {
  return path.join(process.cwd(), "tests", "stella", "custom");
}

export function resolveTestsDir(target: string): string {
  if (target === "stella") {
    return getStellaTestsDir();
  }

  return path.resolve(process.cwd(), target);
}

export function getBuildPath(): string {
  return path.join(process.cwd(), "build", "index.js");
}

export function collectStellaTests(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const tests: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tests.push(...collectStellaTests(fullPath));
    } else if (entry.name.endsWith(".stella")) {
      tests.push(fullPath);
    }
  }

  return tests.sort((a, b) => a.localeCompare(b));
}

export function parseExpectation(source: string): TestExpectation | null {
  const lines = source.split("\n");
  let expectation: TestExpectation | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("// @expect-error")) {
      const rawExpectation = trimmed.replace("// @expect-error", "").trim();
      const match = rawExpectation.match(/^([A-Z0-9_]+)(?::(\d+):(\d+))?$/);
      if (match) {
        expectation = {
          type: "error",
          codes: [match[1]],
          line: match[2] ? Number(match[2]) : undefined,
          col: match[3] ? Number(match[3]) : undefined,
        };
      }
    } else if (trimmed === "// @expect-success") {
      expectation = { type: "success" };
    }
  }

  return expectation;
}

export function readExpectationFromFile(filePath: string): TestExpectation | null {
  const source = fs.readFileSync(filePath, "utf-8");
  return parseExpectation(source);
}

export function runTypecheckerWithSource(
  source: string,
  buildPath: string
): SpawnSyncReturns<string> {
  return spawnSync("node", [buildPath], {
    encoding: "utf-8",
    input: source,
    timeout: 10000,
  });
}

export function runTypecheckerOnFile(
  filePath: string,
  buildPath: string
): SpawnSyncReturns<string> {
  const source = fs.readFileSync(filePath, "utf-8");
  return runTypecheckerWithSource(source, buildPath);
}

export function parseTypecheckerOutput(stderr: string): ParsedTypecheckerOutput {
  const plain = stripAnsi(stderr);
  const errorCodes = plain.match(/\[ERROR_[A-Z0-9_]+\]/g) ?? [];
  const sourceMatch = plain.match(/(?:^|\n)line (\d+), col (\d+)(?:\n|$)/);

  if (!sourceMatch) {
    return { errorCodes };
  }

  return {
    errorCodes,
    source: {
      line: Number(sourceMatch[1]),
      col: Number(sourceMatch[2]),
    },
  };
}

export function relativeTestName(filePath: string, testsDir: string): string {
  return path.relative(testsDir, filePath);
}

export function printResult(result: TestResultData): void {
  if (result.status === "pass") {
    console.log(chalk.green("✓") + " " + result.name);
  } else if (result.status === "fail") {
    console.log(chalk.red("✗") + " " + result.name);
    console.log(chalk.gray("  " + result.reason));
  } else {
    console.log(
      chalk.yellow("○") + " " + chalk.dim(result.name) + chalk.gray(` (${result.reason})`)
    );
  }
}

export function printSummary(results: TestResultData[]): void {
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  console.log();

  const parts: string[] = [];
  parts.push(chalk.green.bold(`${passed} passed`));

  if (failed > 0) {
    parts.push(chalk.red.bold(`${failed} failed`));
  } else {
    parts.push(chalk.dim("0 failed"));
  }

  if (skipped > 0) {
    parts.push(chalk.yellow(`${skipped} skipped`));
  }

  console.log(parts.join(" · "));
  console.log();
}
