import chalk from "chalk";
import { classifyStellaToken, lexStellaSource } from "./stella-token-highlighting";

const COLORS = {
  keyword: "#569CD6",
  type: "#4EC9B0",
  literal: "#DCDCAA",
  number: "#B5CEA8",
  comment: "#6A9955",
  operator: "#C586C0",
  identifier: "#D4D4D4",
  extension: "#9CDCFE",
  inlineValue: "#DCDCAA",
};

interface HighlightToken {
  line: number;
  column: number;
  text: string;
  style: ReturnType<typeof classifyStellaToken>;
}

function getLineTokens(sourceCode: string): Map<number, HighlightToken[]> {
  const lineTokens = new Map<number, HighlightToken[]>();
  for (const token of lexStellaSource(sourceCode)) {
    const tokens = lineTokens.get(token.line) ?? [];
    tokens.push({
      line: token.line,
      column: token.column,
      text: token.text,
      style: classifyStellaToken(token.type, token.text),
    });
    lineTokens.set(token.line, tokens);
  }

  for (const tokens of lineTokens.values()) {
    tokens.sort((left, right) => left.column - right.column);
  }

  return lineTokens;
}

function styleUntokenizedSegment(text: string): string {
  const commentStart = text.indexOf("//");
  if (commentStart < 0) {
    return text;
  }
  return text.slice(0, commentStart) + chalk.hex(COLORS.comment)(text.slice(commentStart));
}

function styleLexedToken(token: HighlightToken, tokenText: string): string {
  switch (token.style) {
    case "keyword":
      return chalk.hex(COLORS.keyword)(tokenText);
    case "number":
      return chalk.hex(COLORS.number)(tokenText);
    case "atom":
    case "memoryAddress":
      return chalk.hex(COLORS.literal)(tokenText);
    case "typeName":
      return chalk.hex(COLORS.type)(tokenText);
    case "operator":
      return chalk.hex(COLORS.operator)(tokenText);
    case "comment":
      return chalk.hex(COLORS.comment)(tokenText);
    case "variableName":
    case null:
      return chalk.hex(COLORS.identifier)(tokenText);
  }
}

function tokenizeAndHighlight(line: string, tokens: readonly HighlightToken[]): string {
  if (tokens.length === 0) {
    return styleUntokenizedSegment(line);
  }

  const parts: string[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const tokenStart = Math.min(line.length, Math.max(0, token.column));
    const visibleStart = Math.max(cursor, tokenStart);
    if (visibleStart > cursor) {
      parts.push(styleUntokenizedSegment(line.slice(cursor, visibleStart)));
    }

    const tokenEnd = Math.min(
      line.length,
      Math.max(visibleStart, token.column + token.text.length)
    );
    if (tokenEnd > visibleStart) {
      parts.push(styleLexedToken(token, line.slice(visibleStart, tokenEnd)));
      cursor = tokenEnd;
    }
  }

  if (cursor < line.length) {
    parts.push(styleUntokenizedSegment(line.slice(cursor)));
  }

  return parts.join("");
}

export interface RenderCodeOptions {
  sourceCode: string;
  startLine?: number;
  endLine?: number;
  highlightedLine?: number;
  highlightedCol?: number;
}

export function renderCodeSnippet({
  sourceCode,
  startLine,
  endLine,
  highlightedLine,
  highlightedCol,
}: RenderCodeOptions): string {
  const normalizedSourceCode = sourceCode.replace(/\t/g, "  ");
  const lines = normalizedSourceCode.split(/\r?\n/);
  const lineTokens = getLineTokens(normalizedSourceCode);
  const firstLine = Math.max(1, startLine ?? 1);
  const lastLine = Math.min(lines.length, endLine ?? lines.length);

  if (lastLine < firstLine) {
    return "";
  }

  const selectedLines = lines.slice(firstLine - 1, lastLine);
  const maxLineWidth = Math.max(...selectedLines.map((line) => line.length));
  const lineNumberWidth = String(lastLine).length;
  const lineNumberGutterWidth = lineNumberWidth + 3;
  const padding = 2;
  const totalWidth = maxLineWidth + lineNumberGutterWidth + padding * 2;

  const gray = chalk.ansi256(240);
  const ellipsisContent = " ".repeat(lineNumberGutterWidth) + "...";
  const renderedLines: string[] = [
    gray("┌" + "─".repeat(totalWidth) + "┐"),
    gray("│") +
      " ".repeat(padding) +
      gray(ellipsisContent) +
      " ".repeat(totalWidth - padding - ellipsisContent.length) +
      gray("│"),
  ];

  for (let lineNo = firstLine; lineNo <= lastLine; lineNo++) {
    const line = lines[lineNo - 1];
    const lineNumberPrefix = `${lineNo.toString().padStart(lineNumberWidth, " ")} │ `;
    renderedLines.push(
      gray("│") +
        " ".repeat(padding) +
        gray(lineNumberPrefix) +
        tokenizeAndHighlight(line, lineTokens.get(lineNo) ?? []) +
        " ".repeat(maxLineWidth - line.length + padding) +
        gray("│")
    );
    if (lineNo === highlightedLine && highlightedCol !== undefined) {
      const caretPrefix = " ".repeat(lineNumberWidth) + " │ ";
      const caretOffset = Math.max(0, highlightedCol - 1);
      const remainingWidth = Math.max(0, maxLineWidth - highlightedCol);
      renderedLines.push(
        gray("│") +
          " ".repeat(padding) +
          gray(caretPrefix) +
          " ".repeat(caretOffset) +
          chalk.red("^") +
          " ".repeat(remainingWidth + padding) +
          gray("│")
      );
    }
  }

  return (
    renderedLines.join("\n") +
    "\n" +
    gray("│") +
    " ".repeat(padding) +
    gray(ellipsisContent) +
    " ".repeat(totalWidth - padding - ellipsisContent.length) +
    gray("│") +
    "\n" +
    gray("└" + "─".repeat(totalWidth) + "┘")
  );
}

export function renderInterpolatedText(
  text: string,
  styleText: (value: string) => string = (value) => value
): string {
  let result = "";
  let current = "";
  let inInterpolation = false;

  for (const char of text) {
    if (char === "`") {
      if (inInterpolation) {
        result += chalk.hex(COLORS.inlineValue).bold(current);
      } else {
        result += styleText(current);
      }
      current = "";
      inInterpolation = !inInterpolation;
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    if (inInterpolation) {
      result += chalk.hex(COLORS.inlineValue).bold(current);
    } else {
      result += styleText(current);
    }
  }

  return result;
}
