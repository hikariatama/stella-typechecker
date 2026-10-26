import type { TypingMethod } from "../../../src/typechecker";

export type AnalyzeRequest = {
  code: string;
  requestId: string;
};

export type HoverItem = {
  startOffset: number;
  endOffset: number;
  renderedType: string;
  typingMethod?: TypingMethod;
  line?: number;
  col?: number;
};

export type AnalyzeError = {
  code?: string;
  description: string;
  line?: number;
  col?: number;
};

export type AnalyzeResponse = {
  requestId: string;
  status: "well-typed" | "ill-typed" | "parse-error";
  hoverItems: HoverItem[];
  error?: AnalyzeError;
};
