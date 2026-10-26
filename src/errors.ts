import type { Expr, Pattern, Type } from "./ast";
import chalk from "chalk";
import { printExpr, printPattern } from "./expr-printer";
import { renderCodeSnippet, renderInterpolatedText } from "./render-code";
import { getSourceContext, type SourceContext } from "./source-context";
import { printType } from "./type-utils";

export enum ErrorCode {
  ERROR_MISSING_MAIN = "ERROR_MISSING_MAIN",
  ERROR_INCORRECT_TYPE_OF_MAIN = "ERROR_INCORRECT_TYPE_OF_MAIN",
  ERROR_UNDEFINED_VARIABLE = "ERROR_UNDEFINED_VARIABLE",
  ERROR_ILLEGAL_NEGATIVE_LITERAL = "ERROR_ILLEGAL_NEGATIVE_LITERAL",
  ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION = "ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION",
  ERROR_NOT_A_FUNCTION = "ERROR_NOT_A_FUNCTION",
  ERROR_NOT_A_TUPLE = "ERROR_NOT_A_TUPLE",
  ERROR_NOT_A_RECORD = "ERROR_NOT_A_RECORD",
  ERROR_NOT_A_LIST = "ERROR_NOT_A_LIST",
  ERROR_UNEXPECTED_LAMBDA = "ERROR_UNEXPECTED_LAMBDA",
  ERROR_UNEXPECTED_TYPE_FOR_PARAMETER = "ERROR_UNEXPECTED_TYPE_FOR_PARAMETER",
  ERROR_UNEXPECTED_TUPLE = "ERROR_UNEXPECTED_TUPLE",
  ERROR_UNEXPECTED_RECORD = "ERROR_UNEXPECTED_RECORD",
  ERROR_UNEXPECTED_VARIANT = "ERROR_UNEXPECTED_VARIANT",
  ERROR_UNEXPECTED_LIST = "ERROR_UNEXPECTED_LIST",
  ERROR_UNEXPECTED_INJECTION = "ERROR_UNEXPECTED_INJECTION",
  ERROR_MISSING_RECORD_FIELDS = "ERROR_MISSING_RECORD_FIELDS",
  ERROR_UNEXPECTED_RECORD_FIELDS = "ERROR_UNEXPECTED_RECORD_FIELDS",
  ERROR_UNEXPECTED_FIELD_ACCESS = "ERROR_UNEXPECTED_FIELD_ACCESS",
  ERROR_UNEXPECTED_VARIANT_LABEL = "ERROR_UNEXPECTED_VARIANT_LABEL",
  ERROR_MISSING_VARIANT_LABELS = "ERROR_MISSING_VARIANT_LABELS",
  ERROR_TUPLE_INDEX_OUT_OF_BOUNDS = "ERROR_TUPLE_INDEX_OUT_OF_BOUNDS",
  ERROR_UNEXPECTED_TUPLE_LENGTH = "ERROR_UNEXPECTED_TUPLE_LENGTH",
  ERROR_AMBIGUOUS_SUM_TYPE = "ERROR_AMBIGUOUS_SUM_TYPE",
  ERROR_AMBIGUOUS_VARIANT_TYPE = "ERROR_AMBIGUOUS_VARIANT_TYPE",
  ERROR_AMBIGUOUS_LIST_TYPE = "ERROR_AMBIGUOUS_LIST_TYPE",
  ERROR_ILLEGAL_EMPTY_MATCHING = "ERROR_ILLEGAL_EMPTY_MATCHING",
  ERROR_NONEXHAUSTIVE_MATCH_PATTERNS = "ERROR_NONEXHAUSTIVE_MATCH_PATTERNS",
  ERROR_UNEXPECTED_PATTERN_FOR_TYPE = "ERROR_UNEXPECTED_PATTERN_FOR_TYPE",
  ERROR_DUPLICATE_RECORD_FIELDS = "ERROR_DUPLICATE_RECORD_FIELDS",
  ERROR_DUPLICATE_RECORD_TYPE_FIELDS = "ERROR_DUPLICATE_RECORD_TYPE_FIELDS",
  ERROR_DUPLICATE_VARIANT_TYPE_FIELDS = "ERROR_DUPLICATE_VARIANT_TYPE_FIELDS",
  ERROR_INCORRECT_ARITY_OF_MAIN = "ERROR_INCORRECT_ARITY_OF_MAIN",
  ERROR_INCORRECT_NUMBER_OF_ARGUMENTS = "ERROR_INCORRECT_NUMBER_OF_ARGUMENTS",
  ERROR_UNEXPECTED_NUMBER_OF_PARAMETERS_IN_LAMBDA = "ERROR_UNEXPECTED_NUMBER_OF_PARAMETERS_IN_LAMBDA",
  ERROR_DUPLICATE_PATTERN_VARIABLE = "ERROR_DUPLICATE_PATTERN_VARIABLE",
  ERROR_AMBIGUOUS_PATTERN_TYPE = "ERROR_AMBIGUOUS_PATTERN_TYPE",
  ERROR_UNEXPECTED_DATA_FOR_NULLARY_LABEL = "ERROR_UNEXPECTED_DATA_FOR_NULLARY_LABEL",
  ERROR_MISSING_DATA_FOR_LABEL = "ERROR_MISSING_DATA_FOR_LABEL",
  ERROR_UNEXPECTED_NON_NULLARY_VARIANT_PATTERN = "ERROR_UNEXPECTED_NON_NULLARY_VARIANT_PATTERN",
  ERROR_UNEXPECTED_NULLARY_VARIANT_PATTERN = "ERROR_UNEXPECTED_NULLARY_VARIANT_PATTERN",
  ERROR_EXCEPTION_TYPE_NOT_DECLARED = "ERROR_EXCEPTION_TYPE_NOT_DECLARED",
  ERROR_AMBIGUOUS_THROW_TYPE = "ERROR_AMBIGUOUS_THROW_TYPE",
  ERROR_AMBIGUOUS_REFERENCE_TYPE = "ERROR_AMBIGUOUS_REFERENCE_TYPE",
  ERROR_AMBIGUOUS_PANIC_TYPE = "ERROR_AMBIGUOUS_PANIC_TYPE",
  ERROR_NOT_A_REFERENCE = "ERROR_NOT_A_REFERENCE",
  ERROR_UNEXPECTED_MEMORY_ADDRESS = "ERROR_UNEXPECTED_MEMORY_ADDRESS",
  ERROR_UNEXPECTED_REFERENCE = "ERROR_UNEXPECTED_REFERENCE",
  ERROR_UNEXPECTED_SUBTYPE = "ERROR_UNEXPECTED_SUBTYPE",
  ERROR_DUPLICATE_EXCEPTION_TYPE = "ERROR_DUPLICATE_EXCEPTION_TYPE",
  ERROR_DUPLICATE_EXCEPTION_VARIANT = "ERROR_DUPLICATE_EXCEPTION_VARIANT",
  ERROR_CONFLICTING_EXCEPTION_DECLARATIONS = "ERROR_CONFLICTING_EXCEPTION_DECLARATIONS",
  ERROR_ILLEGAL_LOCAL_EXCEPTION_TYPE = "ERROR_ILLEGAL_LOCAL_EXCEPTION_TYPE",
  ERROR_ILLEGAL_LOCAL_OPEN_VARIANT_EXCEPTION = "ERROR_ILLEGAL_LOCAL_OPEN_VARIANT_EXCEPTION",
  ERROR_OCCURS_CHECK_INFINITE_TYPE = "ERROR_OCCURS_CHECK_INFINITE_TYPE",
  ERROR_NOT_A_GENERIC_FUNCTION = "ERROR_NOT_A_GENERIC_FUNCTION",
  ERROR_UNDEFINED_TYPE_VARIABLE = "ERROR_UNDEFINED_TYPE_VARIABLE",
  ERROR_AMBIGUOUS_TYPE = "ERROR_AMBIGUOUS_TYPE",
  ERROR_DUPLICATE_TYPE_PARAMETER = "ERROR_DUPLICATE_TYPE_PARAMETER",
  ERROR_INCORRECT_NUMBER_OF_TYPE_ARGUMENTS = "ERROR_INCORRECT_NUMBER_OF_TYPE_ARGUMENTS",
}

export class TypeCheckError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly description: string,
    public readonly context: SourceContext | undefined = undefined
  ) {
    super(`${code}: ${description}`);
  }
}

function formatValue(value: string): string {
  return `\`${value}\``;
}

function formatList(values: string[]): string {
  return values.map((value) => formatValue(value)).join(", ");
}

function formatMissingPattern(pattern: string): string {
  if (pattern === "inl" || pattern === "inr") {
    return `${pattern} (__something__)`;
  }
  return pattern;
}

function formatEnabledExtensions(extensions: string[]): string {
  if (extensions.length === 0) {
    return formatValue("none");
  }
  return formatList(extensions);
}

export function formatTypeCheckError(error: TypeCheckError, sourceCode?: string): string {
  const tagLine = chalk.red.bold(`Program is ill-typed! [${error.code}]`);
  const description = renderInterpolatedText(error.description, (value) => chalk.red(value));
  const locationLine =
    error.context === undefined
      ? undefined
      : chalk.cyan(`line ${error.context.line}, col ${error.context.col}`);
  const codeContext =
    sourceCode !== undefined && error.context !== undefined
      ? renderCodeSnippet({
          sourceCode,
          startLine: error.context.line - 2,
          endLine: error.context.line + 2,
          highlightedLine: error.context.line,
          highlightedCol: error.context.col,
        })
      : "";

  return [tagLine, description, locationLine, codeContext]
    .filter((section) => section && section.length > 0)
    .join("\n");
}

class ErrorHelpers {
  private throwTypeError(code: ErrorCode, description: string, node?: object): never {
    throw new TypeCheckError(code, description, getSourceContext(node));
  }

  private throwUnsupportedSyntaxError(code: ErrorCode, description: string, node?: object): never {
    throw new TypeCheckError(code, description, getSourceContext(node));
  }

  private throwLegacyIllegalError(description: string, node?: object): never {
    throw new TypeCheckError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      description,
      getSourceContext(node)
    );
  }

  private buildUnexpectedTypeForExpressionDescription(
    expected: Type,
    actual: Type,
    expr: Expr
  ): string {
    return `expected type ${formatValue(printType(expected))} but got ${formatValue(printType(actual))} when typechecking the expression ${formatValue(printExpr(expr))}`;
  }

  missingMain(): never {
    return this.throwTypeError(
      ErrorCode.ERROR_MISSING_MAIN,
      "main function is not found in the program"
    );
  }

  incorrectTypeOfMain(actualType: Type, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_INCORRECT_TYPE_OF_MAIN,
      `incorrect type of main: ${formatValue(printType(actualType))}`,
      node ?? actualType
    );
  }

  undefinedVariable(name: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNDEFINED_VARIABLE,
      `undefined variable ${formatValue(name)}`,
      node
    );
  }

  illegalNegativeLiteral(value: number, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_ILLEGAL_NEGATIVE_LITERAL,
      `illegal negative literal: ${formatValue(String(value))}`,
      node
    );
  }

  unexpectedTypeForExpression(expected: Type, actual: Type, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      this.buildUnexpectedTypeForExpressionDescription(expected, actual, expr),
      expr
    );
  }

  unexpectedType(expected: Type, actual: Type, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      `expected type ${formatValue(printType(expected))} but got ${formatValue(printType(actual))}`,
      node
    );
  }

  unexpectedSubtype(expected: Type, actual: Type, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_SUBTYPE,
      `expected a subtype of type ${formatValue(printType(expected))} but found type ${formatValue(printType(actual))} for expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  notAFunction(expr: Expr, actualType: Type, callExpr?: Expr): never {
    if (callExpr) {
      return this.throwTypeError(
        ErrorCode.ERROR_NOT_A_FUNCTION,
        `expected a function type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))} in the function call ${formatValue(printExpr(callExpr))}`,
        callExpr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_NOT_A_FUNCTION,
      `expected a function type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  notATuple(expr: Expr, actualType: Type, inExpr?: Expr): never {
    if (inExpr) {
      return this.throwTypeError(
        ErrorCode.ERROR_NOT_A_TUPLE,
        `expected an expression of tuple type but got expression ${formatValue(printExpr(expr))} of type ${formatValue(printType(actualType))} in expression ${formatValue(printExpr(inExpr))}`,
        inExpr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_NOT_A_TUPLE,
      `expected an expression of tuple type but got expression ${formatValue(printExpr(expr))} of type ${formatValue(printType(actualType))}`,
      expr
    );
  }

  notARecord(expr: Expr, actualType: Type, inExpr?: Expr): never {
    if (inExpr) {
      return this.throwTypeError(
        ErrorCode.ERROR_NOT_A_RECORD,
        `expected a record type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))} in the expression ${formatValue(printExpr(inExpr))}`,
        inExpr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_NOT_A_RECORD,
      `expected a record type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  notAList(expr: Expr, actualType: Type, inExpr?: Expr): never {
    const notAListDescription = inExpr
      ? `expected a list type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))} in the expression ${formatValue(printExpr(inExpr))}`
      : `expected a list type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))}`;

    return this.throwTypeError(ErrorCode.ERROR_NOT_A_LIST, notAListDescription, inExpr ?? expr);
  }

  notAReference(expr: Expr, actualType: Type, inExpr?: Expr): never {
    const description = inExpr
      ? `expected a reference type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))} in the expression ${formatValue(printExpr(inExpr))}`
      : `expected a reference type but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))}`;

    return this.throwTypeError(ErrorCode.ERROR_NOT_A_REFERENCE, description, inExpr ?? expr);
  }

  unexpectedLambda(expectedType: Type, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_LAMBDA,
      `expected an expression of a non-function type ${formatValue(printType(expectedType))} but got an anonymous function ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  unexpectedTypeForParameter(
    paramName: string,
    expected: Type,
    actual: Type,
    node?: object
  ): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_PARAMETER,
      `expected type ${formatValue(printType(expected))} but got ${formatValue(printType(actual))} for the parameter ${formatValue(paramName)}`,
      node ?? actual
    );
  }

  unexpectedSubtypeForParameter(
    paramName: string,
    expected: Type,
    actual: Type,
    node?: object
  ): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_SUBTYPE,
      `expected a subtype of type ${formatValue(printType(expected))} but found type ${formatValue(printType(actual))} for the parameter ${formatValue(paramName)}`,
      node ?? actual
    );
  }

  unexpectedTuple(expectedType: Type, tupleExpr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TUPLE,
      `expected an expression of a non-tuple type ${formatValue(printType(expectedType))} but got a tuple ${formatValue(printExpr(tupleExpr))}`,
      tupleExpr
    );
  }

  unexpectedRecord(expectedType: Type, recordExpr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_RECORD,
      `expected an expression of a non-record type ${formatValue(printType(expectedType))} but got a record ${formatValue(printExpr(recordExpr))}`,
      recordExpr
    );
  }

  unexpectedVariant(expectedType: Type, variantExpr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_VARIANT,
      `expected an expression of a non-variant type ${formatValue(printType(expectedType))} but got a variant ${formatValue(printExpr(variantExpr))}`,
      variantExpr
    );
  }

  unexpectedList(expectedType: Type, listExpr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_LIST,
      `expected an expression of a non-list type ${formatValue(printType(expectedType))} but got a list ${formatValue(printExpr(listExpr))}`,
      listExpr
    );
  }

  unexpectedInjection(expectedType: Type, injectionExpr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_INJECTION,
      `expected an expression of a non-sum type ${formatValue(printType(expectedType))} but got an injection into a sum type ${formatValue(printExpr(injectionExpr))}`,
      injectionExpr
    );
  }

  missingRecordFields(missingFields: string[], expectedType?: Type, recordExpr?: Expr): never {
    const missing = formatList(missingFields);
    if (expectedType && recordExpr) {
      return this.throwTypeError(
        ErrorCode.ERROR_MISSING_RECORD_FIELDS,
        `missing fields ${missing} for an expected record type ${formatValue(printType(expectedType))} in the record ${formatValue(printExpr(recordExpr))}`,
        recordExpr
      );
    }
    return this.throwTypeError(
      ErrorCode.ERROR_MISSING_RECORD_FIELDS,
      `missing fields ${missing}`,
      expectedType
    );
  }

  unexpectedRecordFields(unexpectedFields: string[], node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_RECORD_FIELDS,
      `unexpected fields ${formatList(unexpectedFields)}`,
      node
    );
  }

  unexpectedFieldAccess(label: string, recordType: Type, expr?: Expr): never {
    if (expr) {
      return this.throwTypeError(
        ErrorCode.ERROR_UNEXPECTED_FIELD_ACCESS,
        `unexpected access to field ${formatValue(label)} in a record of type ${formatValue(printType(recordType))} in the expression ${formatValue(printExpr(expr))}`,
        expr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_FIELD_ACCESS,
      `unexpected access to field ${formatValue(label)} in a record of type ${formatValue(printType(recordType))}`,
      recordType
    );
  }

  unexpectedVariantLabel(label: string, variantType: Type): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_VARIANT_LABEL,
      `unexpected label ${formatValue(label)} in a variant type ${formatValue(printType(variantType))}`,
      variantType
    );
  }

  missingVariantLabels(missingLabels: string[], node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_MISSING_VARIANT_LABELS,
      `missing variant labels ${formatList(missingLabels)}`,
      node
    );
  }

  tupleIndexOutOfBounds(
    index: number,
    tupleLength: number,
    tupleExpr?: Expr,
    tupleType?: Type
  ): never {
    if (tupleExpr && tupleType) {
      return this.throwTypeError(
        ErrorCode.ERROR_TUPLE_INDEX_OUT_OF_BOUNDS,
        `unexpected access to component number ${formatValue(String(index))} in a tuple ${formatValue(printExpr(tupleExpr))} of length ${formatValue(String(tupleLength))} and type ${formatValue(printType(tupleType))}`,
        tupleExpr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_TUPLE_INDEX_OUT_OF_BOUNDS,
      `unexpected access to component number ${formatValue(String(index))} in tuple of length ${formatValue(String(tupleLength))}`,
      tupleType
    );
  }

  unexpectedTupleLength(expected: number, actual: number, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TUPLE_LENGTH,
      `unexpected tuple length: expected ${formatValue(String(expected))} but got ${formatValue(String(actual))}`,
      node
    );
  }

  ambiguousSumType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_SUM_TYPE,
      "type inference for sum types is not supported (use type ascriptions or enable #ambiguous-type-as-bottom)",
      node
    );
  }

  ambiguousVariantType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_VARIANT_TYPE,
      "type inference for variants is not supported (use type ascriptions or enable #structural-subtyping)",
      node
    );
  }

  ambiguousListType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_LIST_TYPE,
      "type inference for lists is not supported",
      node
    );
  }

  ambiguousThrowType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_THROW_TYPE,
      "type inference for throw expressions is not supported (use type ascriptions or enable #ambiguous-type-as-bottom)",
      node
    );
  }

  ambiguousReferenceType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_REFERENCE_TYPE,
      "type inference for memory addresses is not supported (use a reference type context or enable #ambiguous-type-as-bottom)",
      node
    );
  }

  ambiguousPanicType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_PANIC_TYPE,
      "type inference for panic is not supported (use type ascriptions or enable #ambiguous-type-as-bottom)",
      node
    );
  }

  illegalEmptyMatching(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_ILLEGAL_EMPTY_MATCHING,
      "empty match expression",
      node
    );
  }

  nonexhaustiveMatchPatterns(missingPatterns: string[], scrutineeExpr?: Expr): never {
    const missing = formatList(missingPatterns.map(formatMissingPattern));
    if (scrutineeExpr) {
      return this.throwTypeError(
        ErrorCode.ERROR_NONEXHAUSTIVE_MATCH_PATTERNS,
        `non-exhaustive pattern matches when matching on expression ${formatValue(printExpr(scrutineeExpr))}. Missing patterns: ${missing}`,
        scrutineeExpr
      );
    }

    return this.throwTypeError(
      ErrorCode.ERROR_NONEXHAUSTIVE_MATCH_PATTERNS,
      `non-exhaustive pattern matches. Missing patterns: ${missing}`
    );
  }

  unexpectedPatternForType(_pattern: Pattern, expectedType: Type): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_PATTERN_FOR_TYPE,
      `unexpected pattern for type ${formatValue(printType(expectedType))}`,
      _pattern
    );
  }

  duplicateRecordFields(fieldName: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_DUPLICATE_RECORD_FIELDS,
      `duplicate record field ${formatValue(fieldName)}`,
      node
    );
  }

  duplicateRecordTypeFields(fieldName: string, recordType: Type): never {
    return this.throwUnsupportedSyntaxError(
      ErrorCode.ERROR_DUPLICATE_RECORD_TYPE_FIELDS,
      `duplicate record field ${formatValue(fieldName)} in record type ${formatValue(printType(recordType))}`,
      recordType
    );
  }

  duplicateVariantTypeFields(label: string, node?: object): never {
    return this.throwUnsupportedSyntaxError(
      ErrorCode.ERROR_DUPLICATE_VARIANT_TYPE_FIELDS,
      `duplicate variant label ${formatValue(label)}`,
      node
    );
  }

  incorrectArityOfMain(arity: number, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_INCORRECT_ARITY_OF_MAIN,
      `incorrect arity of main: expected ${formatValue("1")} but got ${formatValue(String(arity))}`,
      node
    );
  }

  incorrectNumberOfArguments(expected: number, actual: number, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_INCORRECT_NUMBER_OF_ARGUMENTS,
      `incorrect number of arguments: expected ${formatValue(String(expected))} but got ${formatValue(String(actual))} for expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  unexpectedNumberOfParametersInLambda(expected: number, actual: number, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_NUMBER_OF_PARAMETERS_IN_LAMBDA,
      `unexpected number of parameters in lambda: expected ${formatValue(String(expected))} but got ${formatValue(String(actual))}`,
      node
    );
  }

  duplicatePatternVariable(varName: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_DUPLICATE_PATTERN_VARIABLE,
      `duplicate pattern variable ${formatValue(varName)}`,
      node
    );
  }

  ambiguousPatternType(pattern: Pattern): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_PATTERN_TYPE,
      `cannot infer the type for pattern ${formatValue(printPattern(pattern))}`,
      pattern
    );
  }

  unexpectedDataForNullaryLabel(label: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_DATA_FOR_NULLARY_LABEL,
      `unexpected data for nullary label ${formatValue(label)}`,
      node
    );
  }

  missingDataForLabel(label: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_MISSING_DATA_FOR_LABEL,
      `missing data for label ${formatValue(label)}`,
      node
    );
  }

  unexpectedNonNullaryVariantPattern(label: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_NON_NULLARY_VARIANT_PATTERN,
      `unexpected non-nullary variant pattern ${formatValue(label)}`,
      node
    );
  }

  unexpectedNullaryVariantPattern(label: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_NULLARY_VARIANT_PATTERN,
      `unexpected nullary variant pattern ${formatValue(label)}`,
      node
    );
  }

  exceptionTypeNotDeclared(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_EXCEPTION_TYPE_NOT_DECLARED,
      "exceptions are used but no exception type is declared",
      node
    );
  }

  unexpectedMemoryAddress(expectedType: Type, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_MEMORY_ADDRESS,
      `expected a reference type context for memory address ${formatValue(printExpr(expr))}, but found expected type ${formatValue(printType(expectedType))}`,
      expr
    );
  }

  unexpectedReference(expectedType: Type, expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_REFERENCE,
      `expected a reference type but got an expected type ${formatValue(printType(expectedType))} for expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  duplicateExceptionType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_DUPLICATE_EXCEPTION_TYPE,
      "duplicate exception type declaration",
      node
    );
  }

  duplicateExceptionVariant(label: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_DUPLICATE_EXCEPTION_VARIANT,
      `duplicate exception variant ${formatValue(label)}`,
      node
    );
  }

  conflictingExceptionDeclarations(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_CONFLICTING_EXCEPTION_DECLARATIONS,
      "exception type and exception variants cannot be declared in the same scope",
      node
    );
  }

  illegalLocalExceptionType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_ILLEGAL_LOCAL_EXCEPTION_TYPE,
      "exception type declarations are only allowed at the top level",
      node
    );
  }

  illegalLocalOpenVariantException(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_ILLEGAL_LOCAL_OPEN_VARIANT_EXCEPTION,
      "open variant exception declarations are only allowed at the top level",
      node
    );
  }

  unsupportedExpression(expr: Expr): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      `unsupported expression ${formatValue(printExpr(expr))}`,
      expr
    );
  }

  unsupportedType(type: Type): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      `unsupported type ${formatValue(printType(type))}`,
      type
    );
  }

  unsupportedDeclaration(declType: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION,
      `unsupported declaration ${formatValue(declType)}`,
      node
    );
  }

  unsupportedLetRecPattern(pattern: Pattern): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_PATTERN_FOR_TYPE,
      `unsupported letrec pattern ${formatValue(pattern.type)}`,
      pattern
    );
  }

  unsupportedPattern(pattern: Pattern): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNEXPECTED_PATTERN_FOR_TYPE,
      `unsupported pattern ${formatValue(pattern.type)}`,
      pattern
    );
  }

  occursCheckInfiniteType(typeName: string, type: Type, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_OCCURS_CHECK_INFINITE_TYPE,
      `cannot construct an infinite type when unifying ${formatValue(typeName)} with ${formatValue(printType(type))}`,
      node ?? type
    );
  }

  notAGenericFunction(expr: Expr, actualType: Type, callExpr?: Expr): never {
    const target = callExpr ?? expr;
    return this.throwTypeError(
      ErrorCode.ERROR_NOT_A_GENERIC_FUNCTION,
      `expected a universal function but got ${formatValue(printType(actualType))} for the expression ${formatValue(printExpr(expr))}`,
      target
    );
  }

  undefinedTypeVariable(name: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_UNDEFINED_TYPE_VARIABLE,
      `undefined type variable ${formatValue(name)}`,
      node
    );
  }

  ambiguousType(node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_AMBIGUOUS_TYPE,
      "a concrete type cannot be determined from the available constraints",
      node
    );
  }

  duplicateTypeParameter(name: string, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_DUPLICATE_TYPE_PARAMETER,
      `duplicate type parameter ${formatValue(name)}`,
      node
    );
  }

  incorrectNumberOfTypeArguments(expected: number, actual: number, node?: object): never {
    return this.throwTypeError(
      ErrorCode.ERROR_INCORRECT_NUMBER_OF_TYPE_ARGUMENTS,
      `incorrect number of type arguments: expected ${formatValue(String(expected))} but got ${formatValue(String(actual))}`,
      node
    );
  }

  illegalExpression(expression: Expr, suggestion: string, enabledExtensions: string[]): never {
    return this.throwLegacyIllegalError(
      `illegal expression ${formatValue(printExpr(expression))}. Perhaps enable extension ${formatValue(suggestion)}. Currently enabled extensions: ${formatEnabledExtensions(enabledExtensions)}.`,
      expression
    );
  }

  illegalType(type: Type, suggestion: string, enabledExtensions: string[]): never {
    return this.throwLegacyIllegalError(
      `illegal type ${formatValue(printType(type))}. Perhaps enable extension ${formatValue(suggestion)}. Currently enabled extensions: ${formatEnabledExtensions(enabledExtensions)}.`,
      type
    );
  }
}

export const errors = new ErrorHelpers();
