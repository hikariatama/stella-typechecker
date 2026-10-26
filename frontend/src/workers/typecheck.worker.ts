import { CharStreams, CommonTokenStream } from "antlr4";
import type { DeclFun, DeclFunGeneric, Expr, Program, Type } from "../../../src/ast.ts";
import { getSourceContext } from "../../../src/source-context.ts";
import { typecheckProgram, type TypecheckObserver } from "../../../src/typechecker/index.ts";
import { TYPE_UNIT, printType } from "../../../src/type-utils.ts";
import { AstTransformer } from "../../../src/visitors.ts";
import StellaLexer from "../../../src/stella/stellaLexer.ts";
import StellaParser from "../../../src/stella/stellaParser.ts";
import type { AnalyzeError, AnalyzeRequest, AnalyzeResponse, HoverItem } from "./types";

function buildFunctionType(decl: DeclFun | DeclFunGeneric): Type {
  const functionType: Type = {
    type: "TypeFun",
    parametersTypes: decl.parameters.map((parameter) => parameter.paramType),
    returnType: decl.returnType ?? TYPE_UNIT,
  };
  return decl.type === "DeclFunGeneric"
    ? {
        type: "TypeForAll",
        typeVars: decl.typeParams,
        body: functionType,
      }
    : functionType;
}

function getStringProperty(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = Reflect.get(input, key);
  return typeof value === "string" ? value : undefined;
}

function getNumberProperty(input: unknown, key: string): number | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = Reflect.get(input, key);
  return typeof value === "number" ? value : undefined;
}

function toTypecheckError(error: unknown): AnalyzeError | null {
  const description =
    getStringProperty(error, "description") ?? getStringProperty(error, "message");
  const code = getStringProperty(error, "code");
  if (description === undefined && code === undefined) {
    return null;
  }

  const context =
    typeof error === "object" && error !== null ? Reflect.get(error, "context") : undefined;
  return {
    code,
    description: description ?? "Type checking failed",
    line: getNumberProperty(context, "line"),
    col: getNumberProperty(context, "col"),
  };
}

function getLineAndColFromOffset(code: string, offset: number): { line: number; col: number } {
  const clampedOffset = Math.max(0, Math.min(offset, code.length));
  const before = code.slice(0, clampedOffset);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  return {
    line,
    col: clampedOffset - lineStart + 1,
  };
}

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /^[_a-zA-Z0-9!\-:?]$/.test(char);
}

function findIdentifierRange(
  code: string,
  identifier: string,
  startOffset: number,
  endOffset: number
): { startOffset: number; endOffset: number } | null {
  if (identifier.length === 0) {
    return null;
  }

  const start = Math.max(0, Math.min(startOffset, code.length));
  const end = Math.max(start, Math.min(endOffset, code.length));

  let index = code.indexOf(identifier, start);
  while (index !== -1 && index < end) {
    const next = index + identifier.length;
    if (next > end) {
      return null;
    }
    const left = index > 0 ? code[index - 1] : undefined;
    const right = next < code.length ? code[next] : undefined;
    if (!isIdentifierChar(left) && !isIdentifierChar(right)) {
      return {
        startOffset: index,
        endOffset: next,
      };
    }
    index = code.indexOf(identifier, index + 1);
  }

  return null;
}

function collectHoverItems(ast: Program, code: string): HoverItem[] {
  const hoverItems: HoverItem[] = [];

  for (const declaration of ast.declarations) {
    if (declaration.type !== "DeclFun" && declaration.type !== "DeclFunGeneric") {
      continue;
    }

    const declarationContext = getSourceContext(declaration);
    const signature = printType(buildFunctionType(declaration));

    if (declarationContext?.startOffset !== undefined) {
      const functionNameSearchEnd =
        getSourceContext(declaration.returnValue)?.startOffset ??
        declarationContext.endOffset ??
        code.length;
      const functionNameRange = findIdentifierRange(
        code,
        declaration.name,
        declarationContext.startOffset,
        functionNameSearchEnd
      );

      if (functionNameRange && functionNameRange.endOffset > functionNameRange.startOffset) {
        const location = getLineAndColFromOffset(code, functionNameRange.startOffset);
        hoverItems.push({
          startOffset: functionNameRange.startOffset,
          endOffset: functionNameRange.endOffset,
          renderedType: signature,
          line: location.line,
          col: location.col,
        });
      }
    }

    for (const parameter of declaration.parameters) {
      const parameterContext = getSourceContext(parameter);
      if (
        parameterContext?.startOffset === undefined ||
        parameterContext.endOffset === undefined ||
        parameterContext.endOffset <= parameterContext.startOffset
      ) {
        continue;
      }

      const parameterNameRange = findIdentifierRange(
        code,
        parameter.name,
        parameterContext.startOffset,
        parameterContext.endOffset
      );
      const startOffset = parameterNameRange?.startOffset ?? parameterContext.startOffset;
      const endOffset = parameterNameRange?.endOffset ?? parameterContext.endOffset;
      if (endOffset <= startOffset) {
        continue;
      }

      hoverItems.push({
        startOffset,
        endOffset,
        renderedType: printType(parameter.paramType),
        line: parameterContext.line,
        col: parameterContext.col,
      });
    }
  }

  return hoverItems;
}

function getHoverMapKey(item: HoverItem): string {
  return `${item.startOffset}-${item.endOffset}-${item.renderedType}-${item.typingMethod ?? "none"}`;
}

function runAnalysis(code: string, requestId: string): AnalyzeResponse {
  const hoverMap = new Map<string, HoverItem>();

  try {
    const inputStream = CharStreams.fromString(code);
    const lexer = new StellaLexer(inputStream);
    lexer.removeErrorListeners();
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new StellaParser(tokenStream);
    parser.removeErrorListeners();
    const cst = parser.program();

    const transformer = new AstTransformer();
    const ast = transformer.visitProgram(cst);

    const declarationMetadata = collectHoverItems(ast, code);
    for (const item of declarationMetadata) {
      hoverMap.set(getHoverMapKey(item), item);
    }

    const observer: TypecheckObserver = {
      onExpressionTyped: (expr: Expr, type: Type, method) => {
        const context = getSourceContext(expr);
        if (
          context?.startOffset === undefined ||
          context.endOffset === undefined ||
          context.endOffset <= context.startOffset
        ) {
          return;
        }
        const renderedType = printType(type);
        const item: HoverItem = {
          startOffset: context.startOffset,
          endOffset: context.endOffset,
          renderedType,
          typingMethod: method,
          line: context.line,
          col: context.col,
        };
        hoverMap.set(getHoverMapKey(item), item);
      },
    };

    typecheckProgram(ast, observer);

    const hoverItems = Array.from(hoverMap.values()).sort((left, right) => {
      const leftSize = left.endOffset - left.startOffset;
      const rightSize = right.endOffset - right.startOffset;
      return leftSize - rightSize;
    });

    return {
      requestId,
      status: "well-typed",
      hoverItems,
    };
  } catch (error) {
    const hoverItems = Array.from(hoverMap.values()).sort((left, right) => {
      const leftSize = left.endOffset - left.startOffset;
      const rightSize = right.endOffset - right.startOffset;
      return leftSize - rightSize;
    });

    const baseResponse: Omit<AnalyzeResponse, "status"> = {
      requestId,
      hoverItems,
    };

    const typedError = toTypecheckError(error);
    if (typedError) {
      return {
        ...baseResponse,
        status: "ill-typed",
        error: typedError,
      };
    }

    const parseDescription = error instanceof Error ? error.message : "Parser failed";
    return {
      ...baseResponse,
      status: "parse-error",
      error: {
        description: parseDescription,
      },
    };
  }
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const payload = runAnalysis(event.data.code, event.data.requestId);
  self.postMessage(payload);
};
