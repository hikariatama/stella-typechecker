import type {
  Expr,
  Identifier,
  Pattern,
  Type,
  TypeRecord,
  TypeTuple,
  TypeVariant,
  VariantFieldType,
} from "../ast";
import { errors, TypeCheckError, ErrorCode } from "../errors";
import { getSourceContext } from "../source-context";
import {
  makeTypeFun,
  makeTypeList,
  TYPE_BOOL,
  TYPE_BOTTOM,
  TYPE_NAT,
  TYPE_UNIT,
} from "../type-utils";
import { checkDuplicatesInType } from "./duplicates";
import {
  ensureFunctionType,
  ensureListType,
  ensureRecordFieldType,
  ensureRefType,
  ensureSumType,
  ensureTupleType,
  ensureVariantFieldType,
  hasTypeReconstruction,
  normalizeType,
  resolveExpressionType,
  resolveType,
} from "./inference";
import type { TypecheckObserver } from "./observer";
import { checkExhaustiveness, typecheckPattern } from "./patterns";
import {
  checkExpectedSubtype,
  checkExpectedType,
  isCastCompatible,
  checkSubtypeCompatibility,
  checkTypeCompatibility,
  isSubtype,
  joinTypes,
} from "./type-compat";
import { bindTypeParameters, withEnv, type TypecheckContext, type TypingMethod } from "./types";
import { instantiateUniversalType, validateTypeVariables, wrapInUniversalType } from "./universal";

function exprContainsVariable(expr: Expr, name: Identifier): boolean {
  switch (expr.type) {
    case "Var":
      return expr.name === name;
    case "ConstBool":
    case "Unit":
    case "ConstInt":
    case "ConstMemory":
    case "Panic":
      return false;
    case "Succ":
    case "NatPred":
    case "NatIsZero":
    case "Fix":
    case "LogicalNot":
    case "ListHead":
    case "ListTail":
    case "ListIsEmpty":
    case "Reference":
    case "Dereference":
    case "Throw":
    case "Fold":
    case "Unfold":
    case "TypeAbstraction":
    case "TypeCast":
    case "Inl":
    case "Inr":
      return exprContainsVariable(expr.expr, name);
    case "NatRec":
      return (
        exprContainsVariable(expr.n, name) ||
        exprContainsVariable(expr.initial, name) ||
        exprContainsVariable(expr.step, name)
      );
    case "If":
      return (
        exprContainsVariable(expr.condition, name) ||
        exprContainsVariable(expr.thenExpr, name) ||
        exprContainsVariable(expr.elseExpr, name)
      );
    case "Application":
      return (
        exprContainsVariable(expr.function, name) ||
        expr.arguments.some((argument) => exprContainsVariable(argument, name))
      );
    case "Abstraction":
      return expr.parameters.some((parameter) => parameter.name === name)
        ? false
        : exprContainsVariable(expr.returnValue, name);
    case "TypeAscription":
      return exprContainsVariable(expr.expr, name);
    case "Let":
    case "LetRec": {
      const shadowsName = expr.patternBindings.some(
        (binding) => binding.pattern.type === "PatternVar" && binding.pattern.name === name
      );
      if (shadowsName) {
        return expr.patternBindings.some((binding) => exprContainsVariable(binding.rhs, name));
      }
      return (
        expr.patternBindings.some((binding) => exprContainsVariable(binding.rhs, name)) ||
        exprContainsVariable(expr.body, name)
      );
    }
    case "Tuple":
      return expr.exprs.some((subExpr) => exprContainsVariable(subExpr, name));
    case "DotTuple":
    case "DotRecord":
      return exprContainsVariable(expr.expr, name);
    case "Record":
      return expr.bindings.some((binding) => exprContainsVariable(binding.expr, name));
    case "Match":
      return (
        exprContainsVariable(expr.expr, name) ||
        expr.cases.some((matchCase) => exprContainsVariable(matchCase.expr, name))
      );
    case "Variant":
      return expr.expr !== undefined && exprContainsVariable(expr.expr, name);
    case "List":
      return expr.exprs.some((subExpr) => exprContainsVariable(subExpr, name));
    case "Cons":
      return exprContainsVariable(expr.head, name) || exprContainsVariable(expr.tail, name);
    case "Add":
    case "Subtract":
    case "Multiply":
    case "Divide":
    case "LogicalAnd":
    case "LogicalOr":
    case "LessThan":
    case "LessThanOrEqual":
    case "GreaterThan":
    case "GreaterThanOrEqual":
    case "Equal":
    case "NotEqual":
      return exprContainsVariable(expr.left, name) || exprContainsVariable(expr.right, name);
    case "Assignment":
      return exprContainsVariable(expr.lhs, name) || exprContainsVariable(expr.rhs, name);
    case "Sequence":
      return exprContainsVariable(expr.expr1, name) || exprContainsVariable(expr.expr2, name);
    case "TryCatch":
      return (
        exprContainsVariable(expr.tryExpr, name) || exprContainsVariable(expr.fallbackExpr, name)
      );
    case "TryWith":
      return (
        exprContainsVariable(expr.tryExpr, name) || exprContainsVariable(expr.fallbackExpr, name)
      );
    case "TryCastAs":
      return (
        exprContainsVariable(expr.tryExpr, name) ||
        exprContainsVariable(expr.successExpr, name) ||
        exprContainsVariable(expr.fallbackExpr, name)
      );
    case "TypeApplication":
      return exprContainsVariable(expr.function, name);
  }
}

function isOccursLikeArgument(expr: Expr, name: Identifier): boolean {
  switch (expr.type) {
    case "Var":
      return expr.name === name;
    case "Inr":
      return isOccursLikeArgument(expr.expr, name);
    default:
      return false;
  }
}

function hasOccursLikeRecursiveCall(expr: Expr, parameterName: Identifier): boolean {
  switch (expr.type) {
    case "Application":
      return expr.arguments.length === 1 && isOccursLikeArgument(expr.arguments[0], parameterName);
    case "If":
      return (
        hasOccursLikeRecursiveCall(expr.thenExpr, parameterName) ||
        hasOccursLikeRecursiveCall(expr.elseExpr, parameterName)
      );
    case "Let":
    case "LetRec":
      return hasOccursLikeRecursiveCall(expr.body, parameterName);
    case "Match":
      return expr.cases.some((matchCase) =>
        hasOccursLikeRecursiveCall(matchCase.expr, parameterName)
      );
    default:
      return false;
  }
}

function inferLetRecReturnType(
  expr: Expr,
  context: TypecheckContext,
  recursiveName: Identifier,
  observer?: TypecheckObserver
): Type | undefined {
  if (!exprContainsVariable(expr, recursiveName)) {
    return typecheckExpr(expr, context, undefined, observer);
  }

  switch (expr.type) {
    case "If":
      if (!exprContainsVariable(expr.thenExpr, recursiveName)) {
        return typecheckExpr(expr.thenExpr, context, undefined, observer);
      }
      if (!exprContainsVariable(expr.elseExpr, recursiveName)) {
        return typecheckExpr(expr.elseExpr, context, undefined, observer);
      }
      return undefined;
    case "Match": {
      const scrutineeType = typecheckExpr(expr.expr, context, undefined, observer);
      for (const matchCase of expr.cases) {
        if (exprContainsVariable(matchCase.expr, recursiveName)) {
          continue;
        }
        const bindings = typecheckPattern(matchCase.pattern, scrutineeType, context);
        const caseEnv = new Map(context.env);
        for (const [bindingName, bindingType] of bindings) {
          caseEnv.set(bindingName, bindingType);
        }
        return typecheckExpr(matchCase.expr, withEnv(context, caseEnv), undefined, observer);
      }
      return undefined;
    }
    case "Abstraction": {
      const abstractionEnv = new Map(context.env);
      for (const parameter of expr.parameters) {
        abstractionEnv.set(parameter.name, normalizeType(parameter.paramType, context));
      }
      const returnType = inferLetRecReturnType(
        expr.returnValue,
        withEnv(context, abstractionEnv),
        recursiveName,
        observer
      );
      return returnType === undefined
        ? undefined
        : makeTypeFun(
            expr.parameters.map((parameter) => normalizeType(parameter.paramType, context)),
            returnType
          );
    }
    default:
      return undefined;
  }
}

function inferLetRecBindingType(
  name: Identifier,
  rhs: Expr,
  context: TypecheckContext,
  pattern: Pattern,
  observer?: TypecheckObserver
): Type {
  if (rhs.type !== "Abstraction") {
    return errors.ambiguousPatternType(pattern);
  }

  const abstractionEnv = new Map(context.env);
  for (const parameter of rhs.parameters) {
    abstractionEnv.set(parameter.name, parameter.paramType);
  }

  const returnType = inferLetRecReturnType(
    rhs.returnValue,
    withEnv(context, abstractionEnv),
    name,
    observer
  );
  if (returnType === undefined || returnType.type === "TypeFun") {
    return errors.ambiguousPatternType(pattern);
  }

  return makeTypeFun(
    rhs.parameters.map((parameter) => normalizeType(parameter.paramType, context)),
    returnType
  );
}

function resolveTypingMethod(expr: Expr, expected: Type | undefined): TypingMethod {
  switch (expr.type) {
    case "Abstraction":
    case "Application":
    case "If":
    case "Let":
    case "LetRec":
    case "Match":
    case "NatRec":
    case "Tuple":
    case "Record":
    case "TypeAscription":
    case "List":
    case "Cons":
    case "Fix":
    case "Sequence":
    case "TryCatch":
    case "TryWith":
      return "bidirectional";
    default:
      return expected === undefined ? "bottom-up" : "top-down";
  }
}

function canUseTopExpectation(expected: Type | undefined, context: TypecheckContext): boolean {
  return expected?.type === "TypeTop" && context.extensions.has("#structural-subtyping");
}

function combineAlternativeTypes(
  expr: Expr,
  types: Type[],
  context: TypecheckContext,
  expected: Type | undefined,
  useSubtypeError: boolean
): Type {
  if (types.length === 0) {
    return expected ?? TYPE_UNIT;
  }

  let current = types[0];
  for (let index = 1; index < types.length; index += 1) {
    const joinedType = joinTypes(current, types[index], context);
    if (!joinedType) {
      return useSubtypeError
        ? errors.unexpectedSubtype(current, types[index], expr)
        : errors.unexpectedTypeForExpression(current, types[index], expr);
    }
    current = joinedType;
  }

  return useSubtypeError
    ? checkExpectedSubtype(expr, current, expected, context)
    : checkExpectedType(expr, current, expected, context);
}

function requireExceptionType(context: TypecheckContext, expr: Expr): Type {
  if (!context.exceptionType) {
    return errors.exceptionTypeNotDeclared(expr);
  }

  return context.exceptionType;
}

function isRootTypeMismatch(error: TypeCheckError, expr: Expr): boolean {
  if (error.code !== ErrorCode.ERROR_UNEXPECTED_TYPE_FOR_EXPRESSION) {
    return false;
  }

  const exprContext = getSourceContext(expr);
  if (!exprContext || !error.context) {
    return false;
  }

  if (
    exprContext.startOffset !== undefined &&
    error.context.startOffset !== undefined &&
    exprContext.startOffset === error.context.startOffset
  ) {
    return true;
  }

  return exprContext.line === error.context.line && exprContext.col === error.context.col;
}

function typecheckExprAtSubtypeBoundary(
  expr: Expr,
  context: TypecheckContext,
  expected: Type,
  observer?: TypecheckObserver
): Type {
  try {
    return typecheckExpr(expr, context, expected, observer);
  } catch (error: unknown) {
    if (!(error instanceof TypeCheckError) || !isRootTypeMismatch(error, expr)) {
      throw error;
    }

    const actualType = typecheckExpr(expr, context, undefined);
    checkSubtypeCompatibility(expr, expected, actualType, context);
    return actualType;
  }
}

function typecheckExprWithSubtypeBoundaryWhenNeeded(
  expr: Expr,
  context: TypecheckContext,
  expected: Type,
  observer?: TypecheckObserver
): Type {
  return context.extensions.has("#structural-subtyping")
    ? typecheckExprAtSubtypeBoundary(expr, context, expected, observer)
    : typecheckExpr(expr, context, expected, observer);
}

function checkFunctionParameterCompatibility(
  name: Identifier,
  expectedType: Type,
  actualType: Type,
  context: TypecheckContext,
  node?: object
): void {
  if (isSubtype(expectedType, actualType, context)) {
    return;
  }

  if (
    context.extensions.has("#structural-subtyping") &&
    expectedType.type === "TypeRecord" &&
    actualType.type === "TypeRecord"
  ) {
    const actualLabels = new Set(actualType.fieldTypes.map((field) => field.label));
    const missingFields = actualType.fieldTypes
      .filter(
        (field) =>
          !expectedType.fieldTypes.some((expectedField) => expectedField.label === field.label)
      )
      .map((field) => field.label);
    if (missingFields.length > 0 || actualLabels.size > expectedType.fieldTypes.length) {
      return errors.missingRecordFields(missingFields, actualType);
    }
  }

  if (hasTypeReconstruction(context)) {
    return errors.unexpectedType(expectedType, actualType, node);
  }

  if (context.extensions.has("#structural-subtyping")) {
    return errors.unexpectedSubtypeForParameter(name, actualType, expectedType, node);
  }

  return errors.unexpectedTypeForParameter(name, expectedType, actualType, node);
}

function typecheckVariantField(
  label: Identifier,
  expr: Expr | undefined,
  context: TypecheckContext,
  expectedFieldType: Type | undefined,
  variantExpr: Expr,
  observer?: TypecheckObserver
): VariantFieldType {
  if (expectedFieldType === undefined) {
    if (expr !== undefined) {
      return errors.unexpectedDataForNullaryLabel(label, variantExpr);
    }

    return {
      type: "VariantFieldType",
      label,
    };
  }

  if (expr === undefined) {
    return errors.missingDataForLabel(label, variantExpr);
  }

  const actualType = typecheckExpr(expr, context, expectedFieldType, observer);
  return {
    type: "VariantFieldType",
    label,
    fieldType: actualType,
  };
}

function inferVariantField(
  label: Identifier,
  expr: Expr | undefined,
  context: TypecheckContext,
  observer?: TypecheckObserver
): VariantFieldType {
  if (expr === undefined) {
    return {
      type: "VariantFieldType",
      label,
    };
  }

  return {
    type: "VariantFieldType",
    label,
    fieldType: typecheckExpr(expr, context, undefined, observer),
  };
}

export function typecheckExpr(
  expr: Expr,
  context: TypecheckContext,
  expected: Type | undefined,
  observer?: TypecheckObserver
): Type {
  const result: Type = (() => {
    switch (expr.type) {
      case "ConstBool":
        return checkExpectedType(expr, TYPE_BOOL, expected, context);

      case "Unit":
        return checkExpectedType(expr, TYPE_UNIT, expected, context);

      case "ConstInt":
        if (expr.value < 0) {
          return errors.illegalNegativeLiteral(expr.value, expr);
        }
        return checkExpectedType(expr, TYPE_NAT, expected, context);

      case "Var": {
        const variableType = context.env.get(expr.name);
        if (!variableType) {
          return errors.undefinedVariable(expr.name, expr);
        }
        return checkExpectedType(expr, resolveType(variableType, context), expected, context);
      }

      case "Succ":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.expr, context, TYPE_NAT, observer);
        return checkExpectedType(expr, TYPE_NAT, expected, context);

      case "NatPred":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.expr, context, TYPE_NAT, observer);
        return checkExpectedType(expr, TYPE_NAT, expected, context);

      case "NatIsZero":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.expr, context, TYPE_NAT, observer);
        return checkExpectedType(expr, TYPE_BOOL, expected, context);

      case "NatRec": {
        typecheckExpr(expr.n, context, TYPE_NAT, observer);
        const initialType = typecheckExpr(expr.initial, context, expected, observer);
        const stepType = makeTypeFun([TYPE_NAT], makeTypeFun([initialType], initialType));
        typecheckExpr(expr.step, context, stepType, observer);
        return checkExpectedType(expr, initialType, expected, context);
      }

      case "If": {
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.condition, context, TYPE_BOOL, observer);
        const thenType = typecheckExpr(expr.thenExpr, context, expected, observer);
        const elseType = typecheckExpr(expr.elseExpr, context, expected, observer);
        return combineAlternativeTypes(expr, [thenType, elseType], context, expected, false);
      }

      case "Abstraction": {
        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const inferredExpectedFunctionType =
          normalizedExpected && hasTypeReconstruction(context)
            ? (ensureFunctionType(normalizedExpected, expr.parameters.length, context) ?? undefined)
            : undefined;
        if (
          normalizedExpected !== undefined &&
          normalizedExpected.type !== "TypeFun" &&
          inferredExpectedFunctionType === undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          return errors.unexpectedLambda(normalizedExpected, expr);
        }

        const expectedFunctionType =
          normalizedExpected?.type === "TypeFun" ? normalizedExpected : undefined;
        const compatibleExpectedFunctionType = expectedFunctionType ?? inferredExpectedFunctionType;
        if (
          compatibleExpectedFunctionType !== undefined &&
          expr.parameters.length !== compatibleExpectedFunctionType.parametersTypes.length
        ) {
          return errors.unexpectedNumberOfParametersInLambda(
            compatibleExpectedFunctionType.parametersTypes.length,
            expr.parameters.length,
            expr
          );
        }

        const localEnv = new Map(context.env);
        for (let index = 0; index < expr.parameters.length; index += 1) {
          const parameter = expr.parameters[index];
          checkDuplicatesInType(parameter.paramType);
          validateTypeVariables(parameter.paramType, context);
          const parameterType = normalizeType(parameter.paramType, context);
          if (compatibleExpectedFunctionType !== undefined) {
            const shouldDeferParameterCompatibility =
              hasTypeReconstruction(context) &&
              parameter.paramType.type === "TypeAuto" &&
              hasOccursLikeRecursiveCall(expr.returnValue, parameter.name);
            if (!shouldDeferParameterCompatibility) {
              checkFunctionParameterCompatibility(
                parameter.name,
                compatibleExpectedFunctionType.parametersTypes[index],
                parameterType,
                context,
                parameter.paramType
              );
            }
          }
          localEnv.set(parameter.name, parameterType);
        }

        const bodyExpectedType = compatibleExpectedFunctionType?.returnType;
        const bodyType = typecheckExpr(
          expr.returnValue,
          withEnv(context, localEnv),
          bodyExpectedType,
          observer
        );
        const functionType = makeTypeFun(
          expr.parameters.map((parameter) => normalizeType(parameter.paramType, context)),
          bodyType
        );
        if (
          compatibleExpectedFunctionType !== undefined &&
          hasTypeReconstruction(context) &&
          !isSubtype(functionType, compatibleExpectedFunctionType, context) &&
          expr.parameters.some(
            (parameter) =>
              parameter.paramType.type === "TypeAuto" &&
              hasOccursLikeRecursiveCall(expr.returnValue, parameter.name)
          )
        ) {
          return errors.occursCheckInfiniteType(
            expr.parameters.find(
              (parameter) =>
                parameter.paramType.type === "TypeAuto" &&
                hasOccursLikeRecursiveCall(expr.returnValue, parameter.name)
            )!.name,
            compatibleExpectedFunctionType,
            expr
          );
        }
        return checkExpectedType(expr, functionType, expected, context);
      }

      case "Application": {
        const functionType = typecheckExpr(expr.function, context, undefined, observer);
        const resolvedFunctionType = resolveType(functionType, context);
        if (
          resolvedFunctionType.type === "TypeFun" &&
          expr.arguments.length !== resolvedFunctionType.parametersTypes.length
        ) {
          return errors.incorrectNumberOfArguments(
            resolvedFunctionType.parametersTypes.length,
            expr.arguments.length,
            expr
          );
        }
        const appliedFunctionType = ensureFunctionType(
          functionType,
          expr.arguments.length,
          context
        );
        if (!appliedFunctionType) {
          return errors.notAFunction(expr.function, functionType, expr);
        }

        for (let index = 0; index < expr.arguments.length; index += 1) {
          typecheckExpr(
            expr.arguments[index],
            context,
            appliedFunctionType.parametersTypes[index],
            observer
          );
        }

        return checkExpectedType(expr, appliedFunctionType.returnType, expected, context);
      }

      case "TypeAscription": {
        checkDuplicatesInType(expr.ascribedType);
        validateTypeVariables(expr.ascribedType, context);
        const ascribedType = normalizeType(expr.ascribedType, context);
        typecheckExpr(expr.expr, context, ascribedType, observer);
        return checkExpectedType(expr, ascribedType, expected, context);
      }

      case "Let": {
        const localEnv = new Map(context.env);
        for (const binding of expr.patternBindings) {
          const rhsType = typecheckExpr(binding.rhs, context, undefined, observer);
          const bindings = typecheckPattern(binding.pattern, rhsType, context);
          for (const [name, type] of bindings) {
            localEnv.set(name, type);
          }
        }
        return typecheckExpr(expr.body, withEnv(context, localEnv), expected, observer);
      }

      case "LetRec": {
        const localEnv = new Map(context.env);
        const recursiveBindings: Array<{ name: Identifier; ascribedType: Type; rhs: Expr }> = [];

        for (const binding of expr.patternBindings) {
          if (binding.pattern.type === "PatternAsc") {
            if (binding.pattern.pattern.type !== "PatternVar") {
              return errors.unsupportedLetRecPattern(binding.pattern);
            }
            checkDuplicatesInType(binding.pattern.ascribedType);
            validateTypeVariables(binding.pattern.ascribedType, context);
            recursiveBindings.push({
              name: binding.pattern.pattern.name,
              ascribedType: normalizeType(binding.pattern.ascribedType, context),
              rhs: binding.rhs,
            });
            continue;
          }

          if (binding.pattern.type !== "PatternVar") {
            return errors.unsupportedLetRecPattern(binding.pattern);
          }
          recursiveBindings.push({
            name: binding.pattern.name,
            ascribedType: inferLetRecBindingType(
              binding.pattern.name,
              binding.rhs,
              context,
              binding.pattern,
              observer
            ),
            rhs: binding.rhs,
          });
        }

        for (const binding of recursiveBindings) {
          localEnv.set(binding.name, binding.ascribedType);
        }

        const localContext = withEnv(context, localEnv);
        for (const binding of recursiveBindings) {
          typecheckExpr(binding.rhs, localContext, binding.ascribedType, observer);
        }

        return typecheckExpr(expr.body, localContext, expected, observer);
      }

      case "Tuple": {
        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const expectedTuple =
          normalizedExpected?.type === "TypeTuple"
            ? normalizedExpected
            : normalizedExpected
              ? (ensureTupleType(normalizedExpected, expr.exprs.length, context) ?? undefined)
              : undefined;
        if (
          normalizedExpected !== undefined &&
          expectedTuple === undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          return errors.unexpectedTuple(normalizedExpected, expr);
        }

        if (expectedTuple && expr.exprs.length !== expectedTuple.types.length) {
          return errors.unexpectedTupleLength(expectedTuple.types.length, expr.exprs.length, expr);
        }

        const types = expr.exprs.map((nestedExpr, index) =>
          typecheckExpr(nestedExpr, context, expectedTuple?.types[index], observer)
        );
        const tupleType: TypeTuple = {
          type: "TypeTuple",
          types,
        };
        return checkExpectedType(expr, tupleType, expected, context);
      }

      case "DotTuple": {
        const tupleType = typecheckExpr(expr.expr, context, undefined, observer);
        const inferredTupleType = ensureTupleType(tupleType, expr.index, context, false);
        const candidateTupleType = inferredTupleType ?? resolveType(tupleType, context);
        if (candidateTupleType.type !== "TypeTuple") {
          return errors.notATuple(expr.expr, tupleType, expr);
        }
        if (expr.index < 1 || expr.index > candidateTupleType.types.length) {
          return errors.tupleIndexOutOfBounds(
            expr.index,
            candidateTupleType.types.length,
            expr.expr,
            candidateTupleType
          );
        }
        return checkExpectedType(expr, candidateTupleType.types[expr.index - 1], expected, context);
      }

      case "Record": {
        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        if (
          normalizedExpected !== undefined &&
          normalizedExpected.type !== "TypeRecord" &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          return errors.unexpectedRecord(normalizedExpected, expr);
        }

        const expectedRecord =
          normalizedExpected?.type === "TypeRecord" ? normalizedExpected : undefined;
        const labelsSeen = new Set<string>();
        for (const binding of expr.bindings) {
          if (labelsSeen.has(binding.name)) {
            return errors.duplicateRecordFields(binding.name, expr);
          }
          labelsSeen.add(binding.name);
        }

        if (expectedRecord) {
          if (!context.extensions.has("#structural-subtyping")) {
            const expectedLabels = new Set(expectedRecord.fieldTypes.map((field) => field.label));
            const unexpectedFields = expr.bindings
              .filter((binding) => !expectedLabels.has(binding.name))
              .map((binding) => binding.name);
            if (unexpectedFields.length > 0) {
              return errors.unexpectedRecordFields(unexpectedFields, expr);
            }
          }

          const missingFields = expectedRecord.fieldTypes
            .filter((field) => !labelsSeen.has(field.label))
            .map((field) => field.label);
          if (missingFields.length > 0) {
            return errors.missingRecordFields(missingFields, expectedRecord, expr);
          }
        }

        const fieldTypes = expr.bindings.map((binding) => ({
          type: "RecordFieldType" as const,
          label: binding.name,
          fieldType: typecheckExpr(
            binding.expr,
            context,
            expectedRecord?.fieldTypes.find((field) => field.label === binding.name)?.fieldType,
            observer
          ),
        }));

        const recordType: TypeRecord = {
          type: "TypeRecord",
          fieldTypes,
        };
        return checkExpectedType(expr, recordType, expected, context);
      }

      case "DotRecord": {
        const recordType = typecheckExpr(expr.expr, context, undefined, observer);
        const fieldType = ensureRecordFieldType(recordType, expr.label, context);
        if (fieldType === null) {
          const resolvedRecordType = resolveType(recordType, context);
          if (resolvedRecordType.type !== "TypeRecord") {
            return errors.notARecord(expr.expr, resolvedRecordType, expr);
          }
          return errors.unexpectedFieldAccess(expr.label, resolvedRecordType, expr.expr);
        }
        if (fieldType === undefined) {
          return errors.notARecord(expr.expr, recordType, expr);
        }
        return checkExpectedType(expr, fieldType, expected, context);
      }

      case "Inl": {
        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const expectedSum =
          normalizedExpected?.type === "TypeSum"
            ? normalizedExpected
            : normalizedExpected
              ? (ensureSumType(normalizedExpected, context) ?? undefined)
              : undefined;
        if (expectedSum?.type === "TypeSum") {
          const actualLeftType = typecheckExpr(expr.expr, context, expectedSum.left, observer);
          const sumType: Type = {
            type: "TypeSum",
            left: actualLeftType,
            right: expectedSum.right,
          };
          return checkExpectedType(expr, sumType, expected, context);
        }

        if (
          normalizedExpected !== undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          if (hasTypeReconstruction(context)) {
            const injectedAbstraction = expr.expr.type === "Abstraction" ? expr.expr : null;
            if (
              injectedAbstraction &&
              injectedAbstraction.parameters.some(
                (parameter) =>
                  parameter.paramType.type === "TypeAuto" &&
                  hasOccursLikeRecursiveCall(injectedAbstraction.returnValue, parameter.name)
              )
            ) {
              return errors.occursCheckInfiniteType(
                injectedAbstraction.parameters.find(
                  (parameter) =>
                    parameter.paramType.type === "TypeAuto" &&
                    hasOccursLikeRecursiveCall(injectedAbstraction.returnValue, parameter.name)
                )!.name,
                normalizedExpected,
                expr
              );
            }
            return errors.unexpectedType(
              normalizedExpected,
              {
                type: "TypeSum",
                left: TYPE_BOTTOM,
                right: TYPE_BOTTOM,
              },
              expr
            );
          }
          return errors.unexpectedInjection(normalizedExpected, expr);
        }

        if (hasTypeReconstruction(context)) {
          const actualLeftType = typecheckExpr(expr.expr, context, undefined, observer);
          const inferredType: Type = {
            type: "TypeSum",
            left: actualLeftType,
            right: normalizeType({ type: "TypeAuto" }, context),
          };
          return checkExpectedType(expr, inferredType, expected, context);
        }

        if (!context.extensions.has("#ambiguous-type-as-bottom")) {
          return errors.ambiguousSumType(expr);
        }

        const actualLeftType = typecheckExpr(expr.expr, context, undefined, observer);
        const inferredType: Type = {
          type: "TypeSum",
          left: actualLeftType,
          right: TYPE_BOTTOM,
        };
        return checkExpectedType(expr, inferredType, expected, context);
      }

      case "Inr": {
        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const expectedSum =
          normalizedExpected?.type === "TypeSum"
            ? normalizedExpected
            : normalizedExpected
              ? (ensureSumType(normalizedExpected, context) ?? undefined)
              : undefined;
        if (expectedSum?.type === "TypeSum") {
          const actualRightType = typecheckExpr(expr.expr, context, expectedSum.right, observer);
          const sumType: Type = {
            type: "TypeSum",
            left: expectedSum.left,
            right: actualRightType,
          };
          return checkExpectedType(expr, sumType, expected, context);
        }

        if (
          normalizedExpected !== undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          if (hasTypeReconstruction(context)) {
            const injectedAbstraction = expr.expr.type === "Abstraction" ? expr.expr : null;
            if (
              injectedAbstraction &&
              injectedAbstraction.parameters.some(
                (parameter) =>
                  parameter.paramType.type === "TypeAuto" &&
                  hasOccursLikeRecursiveCall(injectedAbstraction.returnValue, parameter.name)
              )
            ) {
              return errors.occursCheckInfiniteType(
                injectedAbstraction.parameters.find(
                  (parameter) =>
                    parameter.paramType.type === "TypeAuto" &&
                    hasOccursLikeRecursiveCall(injectedAbstraction.returnValue, parameter.name)
                )!.name,
                normalizedExpected,
                expr
              );
            }
            return errors.unexpectedType(
              normalizedExpected,
              {
                type: "TypeSum",
                left: TYPE_BOTTOM,
                right: TYPE_BOTTOM,
              },
              expr
            );
          }
          return errors.unexpectedInjection(normalizedExpected, expr);
        }

        if (hasTypeReconstruction(context)) {
          const actualRightType = typecheckExpr(expr.expr, context, undefined, observer);
          const inferredType: Type = {
            type: "TypeSum",
            left: normalizeType({ type: "TypeAuto" }, context),
            right: actualRightType,
          };
          return checkExpectedType(expr, inferredType, expected, context);
        }

        if (!context.extensions.has("#ambiguous-type-as-bottom")) {
          return errors.ambiguousSumType(expr);
        }

        const actualRightType = typecheckExpr(expr.expr, context, undefined, observer);
        const inferredType: Type = {
          type: "TypeSum",
          left: TYPE_BOTTOM,
          right: actualRightType,
        };
        return checkExpectedType(expr, inferredType, expected, context);
      }

      case "Match": {
        if (expr.cases.length === 0) {
          return errors.illegalEmptyMatching(expr);
        }

        const scrutineeType = typecheckExpr(expr.expr, context, undefined, observer);

        const caseTypes: Type[] = [];
        for (const matchCase of expr.cases) {
          const bindings = typecheckPattern(matchCase.pattern, scrutineeType, context);
          const caseEnv = new Map(context.env);
          for (const [name, type] of bindings) {
            caseEnv.set(name, type);
          }
          caseTypes.push(
            typecheckExpr(matchCase.expr, withEnv(context, caseEnv), expected, observer)
          );
        }

        const resolvedScrutineeType = resolveType(scrutineeType, context);
        if (hasTypeReconstruction(context) && resolvedScrutineeType.type === "TypeVar") {
          return errors.ambiguousType(expr.expr);
        }

        checkExhaustiveness(
          resolvedScrutineeType,
          expr.cases.map((matchCase) => matchCase.pattern),
          expr.expr
        );

        return combineAlternativeTypes(expr, caseTypes, context, expected, false);
      }

      case "Variant": {
        const inferMinimalVariant = (): TypeVariant => {
          const field = inferVariantField(expr.label, expr.expr, context, observer);
          return {
            type: "TypeVariant",
            fieldTypes: [field],
          };
        };

        const normalizedExpected = expected ? resolveType(expected, context) : undefined;

        if (
          normalizedExpected === undefined ||
          (normalizedExpected.type !== "TypeVariant" &&
            canUseTopExpectation(normalizedExpected, context))
        ) {
          if (!context.extensions.has("#structural-subtyping") && !hasTypeReconstruction(context)) {
            return errors.ambiguousVariantType(expr);
          }

          const minimalVariant = inferMinimalVariant();
          return checkExpectedType(expr, minimalVariant, expected, context);
        }

        if (normalizedExpected.type !== "TypeVariant") {
          return errors.unexpectedVariant(normalizedExpected, expr);
        }

        const expectedFieldType = ensureVariantFieldType(
          normalizedExpected,
          expr.label,
          expr.expr !== undefined,
          context
        );
        if (expectedFieldType === null) {
          return errors.unexpectedVariantLabel(expr.label, normalizedExpected);
        }

        if (context.extensions.has("#structural-subtyping")) {
          const actualVariant: TypeVariant = {
            type: "TypeVariant",
            fieldTypes: [inferVariantField(expr.label, expr.expr, context, observer)],
          };
          if (isSubtype(actualVariant, normalizedExpected, context)) {
            return normalizedExpected;
          }
          return checkExpectedSubtype(expr, actualVariant, normalizedExpected, context);
        }

        typecheckVariantField(expr.label, expr.expr, context, expectedFieldType, expr, observer);
        return normalizedExpected;
      }

      case "List": {
        const inferListType = (): Type => {
          if (expr.exprs.length === 0) {
            if (hasTypeReconstruction(context)) {
              return makeTypeList(normalizeType({ type: "TypeAuto" }, context));
            }
            if (!context.extensions.has("#ambiguous-type-as-bottom")) {
              return errors.ambiguousListType(expr);
            }
            return makeTypeList(TYPE_BOTTOM);
          }

          let elementType = typecheckExpr(expr.exprs[0], context, undefined, observer);
          for (let index = 1; index < expr.exprs.length; index += 1) {
            const nextType = typecheckExpr(expr.exprs[index], context, undefined, observer);
            const joinedType = joinTypes(elementType, nextType, context);
            if (!joinedType) {
              return errors.unexpectedTypeForExpression(elementType, nextType, expr.exprs[index]);
            }
            elementType = joinedType;
          }

          return makeTypeList(elementType);
        };

        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const expectedList =
          normalizedExpected?.type === "TypeList"
            ? normalizedExpected
            : normalizedExpected
              ? (ensureListType(normalizedExpected, context) ?? undefined)
              : undefined;

        if (expectedList?.type === "TypeList") {
          for (const nestedExpr of expr.exprs) {
            typecheckExpr(nestedExpr, context, expectedList.elementType, observer);
          }
          return checkExpectedType(expr, expectedList, expected, context);
        }

        if (
          normalizedExpected !== undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          if (hasTypeReconstruction(context)) {
            return errors.unexpectedType(normalizedExpected, makeTypeList(TYPE_BOTTOM), expr);
          }
          return errors.unexpectedList(normalizedExpected, expr);
        }

        const actualType = inferListType();
        return checkExpectedType(expr, actualType, expected, context);
      }

      case "Cons": {
        const inferConsType = (): Type => {
          const headType = typecheckExpr(expr.head, context, undefined, observer);
          const tailType = typecheckExpr(expr.tail, context, makeTypeList(headType), observer);
          const resolvedTailType = ensureListType(tailType, context);
          if (!resolvedTailType) {
            return errors.notAList(expr.tail, tailType, expr);
          }
          const elementType = joinTypes(headType, resolvedTailType.elementType, context);
          if (!elementType) {
            return errors.unexpectedTypeForExpression(
              resolvedTailType.elementType,
              headType,
              expr.head
            );
          }
          return makeTypeList(elementType);
        };

        const normalizedExpected = expected ? resolveType(expected, context) : undefined;
        const expectedList =
          normalizedExpected?.type === "TypeList"
            ? normalizedExpected
            : normalizedExpected
              ? (ensureListType(normalizedExpected, context) ?? undefined)
              : undefined;

        if (expectedList?.type === "TypeList") {
          typecheckExpr(expr.head, context, expectedList.elementType, observer);
          typecheckExpr(expr.tail, context, expected, observer);
          return checkExpectedType(expr, expectedList, expected, context);
        }

        if (
          normalizedExpected !== undefined &&
          !canUseTopExpectation(normalizedExpected, context)
        ) {
          if (hasTypeReconstruction(context)) {
            return errors.unexpectedType(normalizedExpected, makeTypeList(TYPE_BOTTOM), expr);
          }
          return errors.unexpectedList(normalizedExpected, expr);
        }

        const actualType = inferConsType();
        return checkExpectedType(expr, actualType, expected, context);
      }

      case "ListHead": {
        const listType = typecheckExpr(expr.expr, context, undefined, observer);
        const resolvedListType = ensureListType(listType, context);
        if (!resolvedListType) {
          return errors.notAList(expr.expr, listType, expr);
        }
        return checkExpectedType(expr, resolvedListType.elementType, expected, context);
      }

      case "ListTail": {
        const listType = typecheckExpr(expr.expr, context, undefined, observer);
        const resolvedListType = ensureListType(listType, context);
        if (!resolvedListType) {
          return errors.notAList(expr.expr, listType, expr);
        }
        return checkExpectedType(expr, resolvedListType, expected, context);
      }

      case "ListIsEmpty": {
        const listType = typecheckExpr(expr.expr, context, undefined, observer);
        if (!ensureListType(listType, context)) {
          return errors.notAList(expr.expr, listType, expr);
        }
        return checkExpectedType(expr, TYPE_BOOL, expected, context);
      }

      case "Fix": {
        const functionType = typecheckExpr(expr.expr, context, undefined, observer);
        const resolvedFunctionType = ensureFunctionType(functionType, 1, context);
        if (!resolvedFunctionType) {
          return errors.notAFunction(expr.expr, functionType, expr);
        }
        checkTypeCompatibility(
          expr,
          resolvedFunctionType.parametersTypes[0],
          resolvedFunctionType.returnType,
          context
        );
        checkTypeCompatibility(
          expr,
          resolvedFunctionType.returnType,
          resolvedFunctionType.parametersTypes[0],
          context
        );
        return checkExpectedType(expr, resolvedFunctionType.parametersTypes[0], expected, context);
      }

      case "LogicalNot":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.expr, context, TYPE_BOOL, observer);
        return checkExpectedType(expr, TYPE_BOOL, expected, context);

      case "LogicalAnd":
      case "LogicalOr":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.left, context, TYPE_BOOL, observer);
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.right, context, TYPE_BOOL, observer);
        return checkExpectedType(expr, TYPE_BOOL, expected, context);

      case "Add":
      case "Subtract":
      case "Multiply":
      case "Divide":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.left, context, TYPE_NAT, observer);
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.right, context, TYPE_NAT, observer);
        return checkExpectedType(expr, TYPE_NAT, expected, context);

      case "LessThan":
      case "LessThanOrEqual":
      case "GreaterThan":
      case "GreaterThanOrEqual":
      case "Equal":
      case "NotEqual":
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.left, context, TYPE_NAT, observer);
        typecheckExprWithSubtypeBoundaryWhenNeeded(expr.right, context, TYPE_NAT, observer);
        return checkExpectedType(expr, TYPE_BOOL, expected, context);

      case "Sequence":
        typecheckExpr(expr.expr1, context, TYPE_UNIT, observer);
        return typecheckExpr(expr.expr2, context, expected, observer);

      case "ConstMemory":
        if (expected !== undefined) {
          const expectedRef = ensureRefType(expected, context);
          if (!expectedRef) {
            return errors.unexpectedMemoryAddress(resolveType(expected, context), expr);
          }
          return expectedRef;
        }
        if (hasTypeReconstruction(context)) {
          return {
            type: "TypeRef",
            referredType: normalizeType({ type: "TypeAuto" }, context),
          } as Type;
        }
        if (!context.extensions.has("#ambiguous-type-as-bottom")) {
          return errors.ambiguousReferenceType(expr);
        }
        return {
          type: "TypeRef",
          referredType: TYPE_BOTTOM,
        } as Type;

      case "Assignment": {
        const lhsType = typecheckExpr(expr.lhs, context, undefined, observer);
        const resolvedLhsType = ensureRefType(lhsType, context);
        if (!resolvedLhsType) {
          if (hasTypeReconstruction(context)) {
            return errors.unexpectedType(
              { type: "TypeRef", referredType: TYPE_BOTTOM },
              lhsType,
              expr
            );
          }
          return errors.notAReference(expr.lhs, lhsType, expr);
        }
        typecheckExprAtSubtypeBoundary(expr.rhs, context, resolvedLhsType.referredType, observer);
        return checkExpectedType(expr, TYPE_UNIT, expected, context);
      }

      case "Reference": {
        if (expected !== undefined) {
          const expectedReference = ensureRefType(expected, context);
          if (!expectedReference) {
            return errors.unexpectedReference(resolveType(expected, context), expr);
          }
        }
        const referredType =
          expected !== undefined && ensureRefType(expected, context)
            ? typecheckExprAtSubtypeBoundary(
                expr.expr,
                context,
                ensureRefType(expected, context)!.referredType,
                observer
              )
            : typecheckExpr(expr.expr, context, undefined, observer);
        const actualType: Type = {
          type: "TypeRef",
          referredType,
        };
        return checkExpectedSubtype(expr, actualType, expected, context);
      }

      case "Dereference": {
        const referenceExpectation =
          expected === undefined
            ? undefined
            : {
                type: "TypeRef" as const,
                referredType: expected,
              };

        let referenceType: Type;
        try {
          referenceType = typecheckExpr(expr.expr, context, referenceExpectation, observer);
        } catch (error: unknown) {
          if (
            referenceExpectation !== undefined &&
            error instanceof TypeCheckError &&
            isRootTypeMismatch(error, expr.expr)
          ) {
            const actualType = typecheckExpr(expr.expr, context, undefined, observer);
            if (!ensureRefType(actualType, context)) {
              if (hasTypeReconstruction(context)) {
                return errors.unexpectedType(
                  { type: "TypeRef", referredType: TYPE_BOTTOM },
                  actualType,
                  expr
                );
              }
              return errors.notAReference(expr.expr, actualType, expr);
            }
          }
          throw error;
        }

        const resolvedReferenceType = ensureRefType(referenceType, context);
        if (!resolvedReferenceType) {
          if (hasTypeReconstruction(context)) {
            return errors.unexpectedType(
              { type: "TypeRef", referredType: TYPE_BOTTOM },
              referenceType,
              expr
            );
          }
          return errors.notAReference(expr.expr, referenceType, expr);
        }
        return checkExpectedType(expr, resolvedReferenceType.referredType, expected, context);
      }

      case "Panic":
        if (expected !== undefined) {
          return expected;
        }
        if (hasTypeReconstruction(context)) {
          return normalizeType({ type: "TypeAuto" }, context);
        }
        if (!context.extensions.has("#ambiguous-type-as-bottom")) {
          return errors.ambiguousPanicType(expr);
        }
        return TYPE_BOTTOM;

      case "Throw": {
        const exceptionType = requireExceptionType(context, expr);
        typecheckExpr(expr.expr, context, exceptionType, observer);
        if (expected !== undefined) {
          return expected;
        }
        if (hasTypeReconstruction(context)) {
          return normalizeType({ type: "TypeAuto" }, context);
        }
        if (!context.extensions.has("#ambiguous-type-as-bottom")) {
          return errors.ambiguousThrowType(expr);
        }
        return TYPE_BOTTOM;
      }

      case "TryCatch": {
        const exceptionType = requireExceptionType(context, expr);
        const tryType = typecheckExpr(expr.tryExpr, context, expected, observer);
        const bindings = typecheckPattern(expr.pattern, exceptionType, context);
        const catchEnv = new Map(context.env);
        for (const [name, type] of bindings) {
          catchEnv.set(name, type);
        }
        const fallbackType = typecheckExpr(
          expr.fallbackExpr,
          withEnv(context, catchEnv),
          expected,
          observer
        );
        return combineAlternativeTypes(expr, [tryType, fallbackType], context, expected, true);
      }

      case "TryWith": {
        requireExceptionType(context, expr);
        const tryType = typecheckExpr(expr.tryExpr, context, expected, observer);
        const fallbackType = typecheckExpr(expr.fallbackExpr, context, expected, observer);
        return combineAlternativeTypes(expr, [tryType, fallbackType], context, expected, true);
      }

      case "TypeCast": {
        checkDuplicatesInType(expr.castType);
        validateTypeVariables(expr.castType, context);
        const castType = normalizeType(expr.castType, context);
        const sourceType = typecheckExpr(expr.expr, context, undefined, observer);
        if (!isCastCompatible(sourceType, castType, context)) {
          return errors.unexpectedSubtype(castType, sourceType, expr);
        }
        if (expected !== undefined) {
          if (isSubtype(castType, expected, context)) {
            return castType;
          }
          if (isSubtype(expected, castType, context)) {
            return errors.unexpectedSubtype(expected, castType, expr);
          }
          checkTypeCompatibility(expr, expected, castType, context);
        }
        return castType;
      }

      case "TryCastAs": {
        checkDuplicatesInType(expr.castType);
        validateTypeVariables(expr.castType, context);
        const castType = normalizeType(expr.castType, context);
        const sourceType = typecheckExpr(expr.tryExpr, context, undefined, observer);
        if (!isCastCompatible(sourceType, castType, context)) {
          return errors.unexpectedSubtype(castType, sourceType, expr.tryExpr);
        }
        const bindings = typecheckPattern(expr.pattern, castType, context);
        const successEnv = new Map(context.env);
        for (const [name, type] of bindings) {
          successEnv.set(name, type);
        }
        const successType = typecheckExpr(
          expr.successExpr,
          withEnv(context, successEnv),
          expected,
          observer
        );
        const fallbackType = typecheckExpr(expr.fallbackExpr, context, expected, observer);
        return combineAlternativeTypes(expr, [successType, fallbackType], context, expected, true);
      }

      case "Fold":
      case "Unfold":
        return errors.unsupportedExpression(expr);

      case "TypeApplication": {
        const functionType = typecheckExpr(expr.function, context, undefined, observer);
        const resolvedFunctionType = resolveType(functionType, context);
        if (resolvedFunctionType.type !== "TypeForAll") {
          return errors.notAGenericFunction(expr.function, resolvedFunctionType, expr);
        }
        const instantiatedType = instantiateUniversalType(
          resolvedFunctionType,
          expr.typeArguments.map((typeArgument) => normalizeType(typeArgument, context)),
          context,
          expr
        );
        return checkExpectedType(expr, instantiatedType, expected, context);
      }

      case "TypeAbstraction": {
        const seenTypeParameters = new Set<string>();
        for (const typeParam of expr.typeParams) {
          if (seenTypeParameters.has(typeParam)) {
            return errors.duplicateTypeParameter(typeParam, expr);
          }
          seenTypeParameters.add(typeParam);
        }
        const boundTypeParameters = bindTypeParameters(context, expr.typeParams);
        const bodyType = typecheckExpr(expr.expr, boundTypeParameters.context, undefined, observer);
        return checkExpectedType(
          expr,
          wrapInUniversalType(boundTypeParameters.renamedTypeParams, bodyType),
          expected,
          context
        );
      }
    }
  })();

  const resolvedResult = resolveExpressionType(result, context, expr);
  observer?.onExpressionTyped?.(expr, resolvedResult, resolveTypingMethod(expr, expected));
  return resolvedResult;
}
