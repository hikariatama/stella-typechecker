import { CharStreams } from "antlr4";
import StellaLexer from "./stella/stellaLexer";

const TYPE_KEYWORDS = new Set(["Bool", "Nat", "Unit", "Top", "Bot", "auto"]);
const LITERALS = new Set(["true", "false", "unit"]);
const KEYWORDS = new Set([
  "exception",
  "throw",
  "try",
  "catch",
  "with",
  "cast",
  "new",
  "panic!",
  "generic",
  "forall",
]);
const OPERATOR_CHARS = new Set([
  ",",
  ";",
  "(",
  ")",
  "{",
  "}",
  "=",
  "<",
  ">",
  "|",
  "+",
  "-",
  "*",
  "/",
  ".",
  ":",
  "&",
  "[",
  "]",
  "!",
]);

export type StellaTokenStyle =
  | "keyword"
  | "typeName"
  | "atom"
  | "number"
  | "comment"
  | "operator"
  | "variableName"
  | "memoryAddress";

export type StellaLexedToken = {
  line: number;
  column: number;
  startOffset: number;
  endOffset: number;
  text: string;
  type: number;
};

function isOperatorToken(tokenText: string): boolean {
  return tokenText.length > 0 && [...tokenText].every((char) => OPERATOR_CHARS.has(char));
}

function toOffset(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function lexStellaSource(sourceCode: string): StellaLexedToken[] {
  const inputStream = CharStreams.fromString(sourceCode);
  const lexer = new StellaLexer(inputStream);
  lexer.removeErrorListeners();

  const tokens: StellaLexedToken[] = [];
  while (true) {
    const token = lexer.nextToken();
    if (token.type === StellaLexer.EOF) {
      break;
    }

    const text = token.text ?? "";
    if (text.length === 0 || token.line < 1 || token.column < 0) {
      continue;
    }

    const startOffset = toOffset(token.start) ?? 0;
    const endOffset = (toOffset(token.stop) ?? startOffset + text.length - 1) + 1;

    tokens.push({
      line: token.line,
      column: token.column,
      startOffset,
      endOffset,
      text,
      type: token.type,
    });
  }

  return tokens;
}

export function classifyStellaToken(tokenType: number, tokenText: string): StellaTokenStyle | null {
  if (
    tokenType === StellaLexer.COMMENT_antlr_builtin ||
    tokenType === StellaLexer.MULTICOMMENT_antlr_builtin
  ) {
    return "comment";
  }

  if (tokenType === StellaLexer.MemoryAddress) {
    return "memoryAddress";
  }

  if (tokenType === StellaLexer.ExtensionName || /^#[A-Za-z0-9_-]+$/.test(tokenText)) {
    return "keyword";
  }

  if (tokenType === StellaLexer.INTEGER || /^\d+$/.test(tokenText)) {
    return "number";
  }

  if (LITERALS.has(tokenText)) {
    return "atom";
  }

  if (TYPE_KEYWORDS.has(tokenText)) {
    return "typeName";
  }

  if (KEYWORDS.has(tokenText)) {
    return "keyword";
  }

  if (isOperatorToken(tokenText)) {
    return "operator";
  }

  if (tokenType <= StellaLexer.FORALL && !tokenText.includes("::")) {
    return "keyword";
  }

  if (tokenText.length > 0 && tokenText[0] === tokenText[0].toUpperCase()) {
    return "typeName";
  }

  return "variableName";
}
