import type { Expr, Type } from "../ast";
import type { TypingMethod } from "./types";

export interface TypecheckObserver {
  onExpressionTyped?: (expr: Expr, type: Type, method: TypingMethod) => void;
}
