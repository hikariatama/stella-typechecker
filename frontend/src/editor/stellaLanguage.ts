import type { StringStream } from "@codemirror/language";
import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import {
  classifyStellaToken,
  lexStellaSource,
  type StellaTokenStyle,
} from "../../../src/stella-token-highlighting.ts";

type StyledLineToken = {
  start: number;
  end: number;
  style: StellaTokenStyle | null;
};

type StellaParserState = {
  lineTokens: StyledLineToken[];
  tokenIndex: number;
};

function lexCodeSegment(line: string, start: number, end: number): StyledLineToken[] {
  if (end <= start) {
    return [];
  }

  const codeSegment = line.slice(start, end);
  return lexStellaSource(codeSegment)
    .map((token) => ({
      start: start + token.column,
      end: Math.max(start + token.column, start + token.column + token.text.length),
      style:
        classifyStellaToken(token.type, token.text) === "memoryAddress"
          ? "atom"
          : classifyStellaToken(token.type, token.text),
    }))
    .filter((token) => token.end > token.start);
}

export function lexLineTokens(line: string): StyledLineToken[] {
  const lineCommentStart = line.indexOf("//");
  const codeEnd = lineCommentStart >= 0 ? lineCommentStart : line.length;
  const lineTokens: StyledLineToken[] = [];
  lineTokens.push(...lexCodeSegment(line, 0, codeEnd));
  if (lineCommentStart >= 0) {
    lineTokens.push({
      start: lineCommentStart,
      end: line.length,
      style: "comment",
    });
  }
  lineTokens.sort((left, right) => left.start - right.start);
  return lineTokens;
}

const stellaParser = {
  startState: (): StellaParserState => ({
    lineTokens: [],
    tokenIndex: 0,
  }),
  token: (stream: StringStream, state: StellaParserState): StellaTokenStyle | null => {
    if (stream.sol()) {
      state.lineTokens = lexLineTokens(stream.string);
      state.tokenIndex = 0;
    }

    while (state.tokenIndex < state.lineTokens.length) {
      const token = state.lineTokens[state.tokenIndex];

      if (stream.pos < token.start) {
        stream.pos = token.start;
        return null;
      }

      if (stream.pos >= token.end) {
        state.tokenIndex += 1;
        continue;
      }

      stream.pos = token.end;
      state.tokenIndex += 1;
      return token.style;
    }

    stream.skipToEnd();
    return null;
  },
};

const language = StreamLanguage.define(stellaParser);

export const stellaLanguage = new LanguageSupport(language);
