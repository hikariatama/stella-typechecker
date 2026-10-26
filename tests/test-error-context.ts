import chalk from "chalk";
import fs from "node:fs";
import {
  collectStellaTests,
  getBuildPath,
  getStellaTestsDir,
  parseTypecheckerOutput,
  printResult,
  printSummary,
  readExpectationFromFile,
  relativeTestName,
  runTypecheckerOnFile,
  type TestResultData,
} from "./helpers";

const testsDir = getStellaTestsDir();
const buildPath = getBuildPath();

function runSingleTest(filePath: string): TestResultData {
  const name = relativeTestName(filePath, testsDir);
  const expectation = readExpectationFromFile(filePath);

  if (!expectation || expectation.type === "success") {
    return {
      name,
      status: "skip",
      reason: "No @expect-error expectation",
    };
  }

  if (expectation.line === undefined || expectation.col === undefined) {
    return {
      name,
      status: "skip",
      reason: "No expected source context in @expect-error",
    };
  }

  const result = runTypecheckerOnFile(filePath, buildPath);
  if (result.error) {
    return {
      name,
      status: "fail",
      reason: `Execution failed: ${result.error.message}`,
    };
  }

  if (result.status === 0) {
    return {
      name,
      status: "fail",
      reason: "Expected typecheck failure to validate source context",
    };
  }

  const parsed = parseTypecheckerOutput(result.stderr ?? "");
  if (!parsed.source) {
    return {
      name,
      status: "fail",
      reason: "Missing source context in stderr",
    };
  }

  if (parsed.source.line !== expectation.line || parsed.source.col !== expectation.col) {
    return {
      name,
      status: "fail",
      reason: `Expected line ${expectation.line}, col ${expectation.col}, got line ${parsed.source.line}, col ${parsed.source.col}`,
    };
  }

  const source = fs.readFileSync(filePath, "utf-8");
  const lines = source.split(/\r?\n/);
  if (parsed.source.line < 1 || parsed.source.line > lines.length) {
    return {
      name,
      status: "fail",
      reason: `Actual line ${parsed.source.line} is out of bounds for file`,
    };
  }

  const lineText = lines[parsed.source.line - 1];
  if (parsed.source.col < 1 || parsed.source.col > lineText.length + 1) {
    return {
      name,
      status: "fail",
      reason: `Actual col ${parsed.source.col} is out of bounds for line length ${lineText.length}`,
    };
  }

  return { name, status: "pass" };
}

async function main(): Promise<void> {
  const tests = collectStellaTests(testsDir);

  console.log();
  console.log(chalk.magenta.bold(`Verifying source context for ${tests.length} Stella tests`));
  console.log();

  if (tests.length === 0) {
    console.log("No test files found in", testsDir);
    process.exit(0);
  }

  const results: TestResultData[] = [];
  for (const filePath of tests) {
    const result = runSingleTest(filePath);
    results.push(result);
    printResult(result);
  }

  printSummary(results);
  process.exit(results.some((result) => result.status === "fail") ? 1 : 0);
}

main();
