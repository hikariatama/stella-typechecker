import chalk from "chalk";
import {
  collectStellaTests,
  getBuildPath,
  parseTypecheckerOutput,
  printResult,
  printSummary,
  readExpectationFromFile,
  relativeTestName,
  resolveTestsDir,
  runTypecheckerOnFile,
  type TestResultData,
} from "./helpers";

const target = process.argv[2] ?? "stella";
const testsDir = resolveTestsDir(target);
const buildPath = getBuildPath();

function runSingleTest(filePath: string): TestResultData {
  const name = relativeTestName(filePath, testsDir);
  const expectation = readExpectationFromFile(filePath);

  const result = runTypecheckerOnFile(filePath, buildPath);
  if (result.error) {
    return {
      name,
      status: "fail",
      reason: `Execution failed: ${result.error.message}`,
    };
  }

  if (!expectation) {
    return {
      name,
      status: "skip",
      reason: "No @expect-error or @expect-success",
    };
  }

  if (expectation.type === "success") {
    if (result.status !== 0) {
      const stderr = result.stderr ?? "";
      const actualError = stderr.split("\n")[0] || "unknown error";
      return {
        name,
        status: "fail",
        reason: `Expected success, got error: ${actualError}`,
      };
    }
    return { name, status: "pass" };
  }

  if (result.status === 0) {
    return {
      name,
      status: "fail",
      reason: `Expected error ${expectation.codes.join(" or ")}, but program passed`,
    };
  }

  const parsed = parseTypecheckerOutput(result.stderr ?? "");
  if (parsed.errorCodes.length !== 1) {
    return {
      name,
      status: "fail",
      reason: `Expected exactly one error code in stderr, got ${parsed.errorCodes.length}`,
    };
  }

  if (!expectation.codes.some((code) => parsed.errorCodes[0].includes(code))) {
    const actualError = (result.stderr ?? "").split("\n")[0] || "unknown";
    return {
      name,
      status: "fail",
      reason: `Expected ${expectation.codes.join(" or ")}, got: ${actualError}`,
    };
  }

  return { name, status: "pass" };
}

async function main(): Promise<void> {
  const tests = collectStellaTests(testsDir);

  console.log();
  console.log(chalk.magenta.bold(`Running ${tests.length} Stella tests from ${target}`));
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
