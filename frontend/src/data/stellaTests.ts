export type TestExpectation = "success" | "error" | "none";

export type StellaTest = {
  id: string;
  path: string;
  name: string;
  source: string;
  expectation: TestExpectation;
};

function parseExpectation(source: string): TestExpectation {
  const lines = source.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "// @expect-success") {
      return "success";
    }
    if (trimmed.startsWith("// @expect-error")) {
      return "error";
    }
  }
  return "none";
}

function toDisplayName(path: string): string {
  const marker = "/tests/stella/";
  const index = path.indexOf(marker);
  if (index >= 0) {
    return path.slice(index + marker.length);
  }
  return path;
}

const testSourceMap = import.meta.glob("../../../tests/stella/custom/**/*.stella", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const stellaTests: StellaTest[] = Object.entries(testSourceMap)
  .map(([path, source]) => ({
    id: path,
    path,
    name: toDisplayName(path),
    source,
    expectation: parseExpectation(source),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
