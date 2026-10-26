import type {
  Expr,
  RecordFieldType,
  Type,
  TypeList,
  TypeRecord,
  TypeTuple,
  TypeVariant,
  VariantFieldType,
} from "../ast";
import { errors } from "../errors";
import { TYPE_TOP, typesEqual } from "../type-utils";
import { hasTypeReconstruction, isInferenceTypeVar, resolveType, unifyTypes } from "./inference";
import type { TypecheckContext } from "./types";

function joinRecordTypes(
  left: TypeRecord,
  right: TypeRecord,
  context: TypecheckContext
): TypeRecord {
  const fieldTypes: RecordFieldType[] = [];

  for (const leftField of left.fieldTypes) {
    const rightField = right.fieldTypes.find((field) => field.label === leftField.label);
    if (!rightField) {
      continue;
    }

    const joinedType = joinTypes(leftField.fieldType, rightField.fieldType, context);
    if (!joinedType) {
      continue;
    }

    fieldTypes.push({
      type: "RecordFieldType",
      label: leftField.label,
      fieldType: joinedType,
    });
  }

  return {
    type: "TypeRecord",
    fieldTypes,
  };
}

function joinVariantTypes(
  left: TypeVariant,
  right: TypeVariant,
  context: TypecheckContext
): TypeVariant | null {
  const fieldMap = new Map<string, VariantFieldType>();

  for (const field of left.fieldTypes) {
    fieldMap.set(field.label, {
      type: "VariantFieldType",
      label: field.label,
      fieldType: field.fieldType,
    });
  }

  for (const field of right.fieldTypes) {
    const existing = fieldMap.get(field.label);
    if (!existing) {
      fieldMap.set(field.label, {
        type: "VariantFieldType",
        label: field.label,
        fieldType: field.fieldType,
      });
      continue;
    }

    if (existing.fieldType === undefined && field.fieldType === undefined) {
      continue;
    }

    if (existing.fieldType === undefined || field.fieldType === undefined) {
      return null;
    }

    const joinedType = joinTypes(existing.fieldType, field.fieldType, context);
    if (!joinedType) {
      return null;
    }

    fieldMap.set(field.label, {
      type: "VariantFieldType",
      label: field.label,
      fieldType: joinedType,
    });
  }

  return {
    type: "TypeVariant",
    fieldTypes: Array.from(fieldMap.values()),
  };
}

function joinTupleTypes(
  left: TypeTuple,
  right: TypeTuple,
  context: TypecheckContext
): TypeTuple | null {
  if (left.types.length !== right.types.length) {
    return null;
  }

  const types: Type[] = [];
  for (let index = 0; index < left.types.length; index += 1) {
    const joinedType = joinTypes(left.types[index], right.types[index], context);
    if (!joinedType) {
      return null;
    }
    types.push(joinedType);
  }

  return {
    type: "TypeTuple",
    types,
  };
}

function joinListTypes(
  left: TypeList,
  right: TypeList,
  context: TypecheckContext
): TypeList | null {
  const elementType = joinTypes(left.elementType, right.elementType, context);
  if (!elementType) {
    return null;
  }

  return {
    type: "TypeList",
    elementType,
  };
}

export function isSubtype(actual: Type, expected: Type, context: TypecheckContext): boolean {
  const resolvedActual = resolveType(actual, context);
  const resolvedExpected = resolveType(expected, context);

  if (typesEqual(resolvedActual, resolvedExpected)) {
    return true;
  }

  if (isInferenceTypeVar(resolvedActual) || isInferenceTypeVar(resolvedExpected)) {
    return unifyTypes(resolvedActual, resolvedExpected, context);
  }

  if (hasTypeReconstruction(context) && unifyTypes(resolvedActual, resolvedExpected, context)) {
    return true;
  }

  if (resolvedActual.type === "TypeBottom") {
    return true;
  }

  if (resolvedExpected.type === "TypeTop") {
    return true;
  }

  if (!context.extensions.has("#structural-subtyping")) {
    return false;
  }

  if (resolvedActual.type !== resolvedExpected.type) {
    return false;
  }

  if (resolvedActual.type === "TypeFun" && resolvedExpected.type === "TypeFun") {
    if (resolvedActual.parametersTypes.length !== resolvedExpected.parametersTypes.length) {
      return false;
    }

    for (let index = 0; index < resolvedActual.parametersTypes.length; index += 1) {
      if (
        !isSubtype(
          resolvedExpected.parametersTypes[index],
          resolvedActual.parametersTypes[index],
          context
        )
      ) {
        return false;
      }
    }

    return isSubtype(resolvedActual.returnType, resolvedExpected.returnType, context);
  }

  if (resolvedActual.type === "TypeRecord" && resolvedExpected.type === "TypeRecord") {
    return resolvedExpected.fieldTypes.every((expectedField) => {
      const actualField = resolvedActual.fieldTypes.find(
        (field) => field.label === expectedField.label
      );
      return (
        actualField !== undefined &&
        isSubtype(actualField.fieldType, expectedField.fieldType, context)
      );
    });
  }

  if (resolvedActual.type === "TypeVariant" && resolvedExpected.type === "TypeVariant") {
    return resolvedActual.fieldTypes.every((actualField) => {
      const expectedField = resolvedExpected.fieldTypes.find(
        (field) => field.label === actualField.label
      );
      if (!expectedField) {
        return false;
      }

      if (actualField.fieldType === undefined && expectedField.fieldType === undefined) {
        return true;
      }

      if (actualField.fieldType === undefined || expectedField.fieldType === undefined) {
        return false;
      }

      return isSubtype(actualField.fieldType, expectedField.fieldType, context);
    });
  }

  if (resolvedActual.type === "TypeTuple" && resolvedExpected.type === "TypeTuple") {
    return (
      resolvedActual.types.length === resolvedExpected.types.length &&
      resolvedActual.types.every((type, index) =>
        isSubtype(type, resolvedExpected.types[index], context)
      )
    );
  }

  if (resolvedActual.type === "TypeSum" && resolvedExpected.type === "TypeSum") {
    return (
      isSubtype(resolvedActual.left, resolvedExpected.left, context) &&
      isSubtype(resolvedActual.right, resolvedExpected.right, context)
    );
  }

  if (resolvedActual.type === "TypeList" && resolvedExpected.type === "TypeList") {
    return isSubtype(resolvedActual.elementType, resolvedExpected.elementType, context);
  }

  if (resolvedActual.type === "TypeRef" && resolvedExpected.type === "TypeRef") {
    return typesEqual(
      resolveType(resolvedActual.referredType, context),
      resolveType(resolvedExpected.referredType, context)
    );
  }

  return false;
}

export function isCastCompatible(source: Type, target: Type, context: TypecheckContext): boolean {
  return isSubtype(source, target, context) || isSubtype(target, source, context);
}

export function joinTypes(left: Type, right: Type, context: TypecheckContext): Type | null {
  if (isSubtype(left, right, context)) {
    return right;
  }

  if (isSubtype(right, left, context)) {
    return left;
  }

  if (!context.extensions.has("#structural-subtyping")) {
    return null;
  }

  switch (left.type) {
    case "TypeRecord":
      return right.type === "TypeRecord" ? joinRecordTypes(left, right, context) : TYPE_TOP;

    case "TypeVariant":
      return right.type === "TypeVariant"
        ? (joinVariantTypes(left, right, context) ?? TYPE_TOP)
        : TYPE_TOP;

    case "TypeTuple":
      return right.type === "TypeTuple"
        ? (joinTupleTypes(left, right, context) ?? TYPE_TOP)
        : TYPE_TOP;

    case "TypeList":
      return right.type === "TypeList"
        ? (joinListTypes(left, right, context) ?? TYPE_TOP)
        : TYPE_TOP;

    default:
      return TYPE_TOP;
  }
}

export function checkExpectedType(
  expr: Expr,
  actual: Type,
  expected: Type | undefined,
  context: TypecheckContext
): Type {
  if (expected !== undefined) {
    checkTypeCompatibility(expr, expected, actual, context);
  }
  return actual;
}

export function checkExpectedSubtype(
  expr: Expr,
  actual: Type,
  expected: Type | undefined,
  context: TypecheckContext
): Type {
  if (expected !== undefined) {
    checkSubtypeCompatibility(expr, expected, actual, context);
  }
  return actual;
}

export function checkTypeCompatibility(
  expr: Expr,
  expected: Type,
  actual: Type,
  context: TypecheckContext
): void {
  if (!isSubtype(actual, expected, context)) {
    return errors.unexpectedTypeForExpression(expected, actual, expr);
  }
}

export function checkSubtypeCompatibility(
  expr: Expr,
  expected: Type,
  actual: Type,
  context: TypecheckContext
): void {
  if (!isSubtype(actual, expected, context)) {
    if (hasTypeReconstruction(context)) {
      return errors.unexpectedType(expected, actual, expr);
    }
    return errors.unexpectedSubtype(expected, actual, expr);
  }
}
