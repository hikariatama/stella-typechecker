import type { Expr, Identifier, Pattern, Type } from "../ast";
import { errors } from "../errors";
import { TYPE_NAT } from "../type-utils";
import { checkDuplicatesInType } from "./duplicates";
import {
  ensureListType,
  ensureRecordType,
  ensureSumType,
  ensureTupleType,
  ensureVariantFieldType,
  normalizeType,
} from "./inference";
import { isCastCompatible, isSubtype } from "./type-compat";
import type { TypecheckContext } from "./types";
import { validateTypeVariables } from "./universal";

export function typecheckPattern(
  pattern: Pattern,
  expectedType: Type,
  context: TypecheckContext
): Map<Identifier, Type> {
  const bindings = new Map<Identifier, Type>();
  collectPatternBindings(pattern, expectedType, context, bindings);
  return bindings;
}

function collectPatternBindings(
  pattern: Pattern,
  expectedType: Type,
  context: TypecheckContext,
  bindings: Map<Identifier, Type>
): void {
  switch (pattern.type) {
    case "PatternVar":
      if (bindings.has(pattern.name)) {
        return errors.duplicatePatternVariable(pattern.name, pattern);
      }
      bindings.set(pattern.name, expectedType);
      break;

    case "PatternTrue":
    case "PatternFalse":
      if (!isSubtype(expectedType, { type: "TypeBool" }, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      break;

    case "PatternUnit":
      if (!isSubtype(expectedType, { type: "TypeUnit" }, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      break;

    case "PatternInt":
      if (!isSubtype(expectedType, TYPE_NAT, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      if (pattern.value < 0) {
        return errors.illegalNegativeLiteral(pattern.value, pattern);
      }
      break;

    case "PatternSucc":
      if (!isSubtype(expectedType, TYPE_NAT, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      collectPatternBindings(pattern.value, TYPE_NAT, context, bindings);
      break;

    case "PatternInl":
      if (!ensureSumType(expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      collectPatternBindings(
        pattern.pattern,
        ensureSumType(expectedType, context)!.left,
        context,
        bindings
      );
      break;

    case "PatternInr":
      if (!ensureSumType(expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      collectPatternBindings(
        pattern.pattern,
        ensureSumType(expectedType, context)!.right,
        context,
        bindings
      );
      break;

    case "PatternTuple":
      if (!ensureTupleType(expectedType, pattern.patterns.length, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      const tupleType = ensureTupleType(expectedType, pattern.patterns.length, context)!;
      for (let index = 0; index < pattern.patterns.length; index += 1) {
        collectPatternBindings(pattern.patterns[index], tupleType.types[index], context, bindings);
      }
      break;

    case "PatternRecord":
      if (!ensureRecordType(expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      const recordType = ensureRecordType(expectedType, context)!;
      const labels = new Set(pattern.patterns.map((labelledPattern) => labelledPattern.label));
      if (labels.size !== recordType.fieldTypes.length) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      for (const labelledPattern of pattern.patterns) {
        const field = recordType.fieldTypes.find(
          (candidate) => candidate.label === labelledPattern.label
        );
        if (!field) {
          return errors.unexpectedPatternForType(pattern, expectedType);
        }
        collectPatternBindings(labelledPattern.pattern, field.fieldType, context, bindings);
      }
      break;

    case "PatternList":
      if (!ensureListType(expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      const listType = ensureListType(expectedType, context)!;
      for (const nestedPattern of pattern.patterns) {
        collectPatternBindings(nestedPattern, listType.elementType, context, bindings);
      }
      break;

    case "PatternCons":
      if (!ensureListType(expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      const consListType = ensureListType(expectedType, context)!;
      collectPatternBindings(pattern.head, consListType.elementType, context, bindings);
      collectPatternBindings(pattern.tail, consListType, context, bindings);
      break;

    case "PatternVariant": {
      const fieldType = ensureVariantFieldType(
        expectedType,
        pattern.label,
        pattern.pattern !== undefined,
        context
      );
      if (fieldType === null) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      if (fieldType === undefined) {
        if (pattern.pattern !== undefined) {
          return errors.unexpectedNonNullaryVariantPattern(pattern.label, pattern);
        }
      } else {
        if (pattern.pattern === undefined) {
          return errors.unexpectedNullaryVariantPattern(pattern.label, pattern);
        }
        collectPatternBindings(pattern.pattern, fieldType, context, bindings);
      }
      break;
    }

    case "PatternAsc":
      checkDuplicatesInType(pattern.ascribedType);
      validateTypeVariables(pattern.ascribedType, context);
      if (!isSubtype(normalizeType(pattern.ascribedType, context), expectedType, context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      collectPatternBindings(
        pattern.pattern,
        normalizeType(pattern.ascribedType, context),
        context,
        bindings
      );
      break;

    case "PatternCastAs":
      checkDuplicatesInType(pattern.castType);
      validateTypeVariables(pattern.castType, context);
      if (!isCastCompatible(expectedType, normalizeType(pattern.castType, context), context)) {
        return errors.unexpectedPatternForType(pattern, expectedType);
      }
      collectPatternBindings(
        pattern.pattern,
        normalizeType(pattern.castType, context),
        context,
        bindings
      );
      break;

    case "LabelledPattern":
      collectPatternBindings(pattern.pattern, expectedType, context, bindings);
      break;
  }
}

function unwrapPattern(pattern: Pattern): Pattern {
  if (pattern.type === "PatternAsc") {
    return unwrapPattern(pattern.pattern);
  }
  return pattern;
}

function patternCoversAllValues(pattern: Pattern, expectedType: Type): boolean {
  const unwrapped = unwrapPattern(pattern);
  if (unwrapped.type === "PatternVar") {
    return true;
  }

  switch (expectedType.type) {
    case "TypeUnit":
      return unwrapped.type === "PatternUnit";
    case "TypeNat":
      return natPatternsExhaustive([unwrapped]);
    case "TypeBool":
      return false;
    case "TypeList":
      return listPatternsExhaustive(expectedType, [unwrapped]);
    case "TypeRecord": {
      if (unwrapped.type !== "PatternRecord") {
        return false;
      }
      if (unwrapped.patterns.length !== expectedType.fieldTypes.length) {
        return false;
      }
      return expectedType.fieldTypes.every((field) => {
        const labelledPattern = unwrapped.patterns.find(
          (nestedPattern) => nestedPattern.label === field.label
        );
        return (
          labelledPattern !== undefined &&
          patternCoversAllValues(labelledPattern.pattern, field.fieldType)
        );
      });
    }
    default:
      return false;
  }
}

function patternMatchesNatZero(pattern: Pattern): boolean {
  const unwrapped = unwrapPattern(pattern);
  return (
    unwrapped.type === "PatternVar" || (unwrapped.type === "PatternInt" && unwrapped.value === 0)
  );
}

function patternMatchesAllPositiveNat(pattern: Pattern): boolean {
  const unwrapped = unwrapPattern(pattern);
  if (unwrapped.type === "PatternVar") {
    return true;
  }
  return unwrapped.type === "PatternSucc" && natPatternsExhaustive([unwrapped.value]);
}

function natPatternsExhaustive(patterns: Pattern[]): boolean {
  return (
    patterns.some((pattern) => unwrapPattern(pattern).type === "PatternVar") ||
    (patterns.some(patternMatchesNatZero) && patterns.some(patternMatchesAllPositiveNat))
  );
}

function patternMatchesEmptyList(pattern: Pattern): boolean {
  const unwrapped = unwrapPattern(pattern);
  return (
    unwrapped.type === "PatternVar" ||
    (unwrapped.type === "PatternList" && unwrapped.patterns.length === 0)
  );
}

function patternMatchesAllNonEmptyLists(
  pattern: Pattern,
  listType: Extract<Type, { type: "TypeList" }>
): boolean {
  const unwrapped = unwrapPattern(pattern);
  if (unwrapped.type === "PatternVar") {
    return true;
  }
  return (
    unwrapped.type === "PatternCons" &&
    patternCoversAllValues(unwrapped.head, listType.elementType) &&
    listPatternsExhaustive(listType, [unwrapped.tail])
  );
}

function listPatternsExhaustive(
  listType: Extract<Type, { type: "TypeList" }>,
  patterns: Pattern[]
): boolean {
  return (
    patterns.some((pattern) => unwrapPattern(pattern).type === "PatternVar") ||
    (patterns.some(patternMatchesEmptyList) &&
      patterns.some((pattern) => patternMatchesAllNonEmptyLists(pattern, listType)))
  );
}

export function checkExhaustiveness(
  scrutineeType: Type,
  patterns: Pattern[],
  scrutineeExpr: Expr
): void {
  switch (scrutineeType.type) {
    case "TypeSum": {
      let hasInl = false;
      let hasInr = false;
      for (const pattern of patterns) {
        const unwrapped = unwrapPattern(pattern);
        if (unwrapped.type === "PatternInl") {
          hasInl = true;
        } else if (unwrapped.type === "PatternInr") {
          hasInr = true;
        } else if (unwrapped.type === "PatternVar") {
          hasInl = true;
          hasInr = true;
        }
      }

      const missing: string[] = [];
      if (!hasInl) {
        missing.push("inl");
      }
      if (!hasInr) {
        missing.push("inr");
      }
      if (missing.length > 0) {
        return errors.nonexhaustiveMatchPatterns(missing, scrutineeExpr);
      }
      break;
    }

    case "TypeVariant": {
      const coveredLabels = new Set<string>();
      let hasWildcard = false;
      for (const pattern of patterns) {
        const unwrapped = unwrapPattern(pattern);
        if (unwrapped.type === "PatternVariant") {
          coveredLabels.add(unwrapped.label);
        } else if (unwrapped.type === "PatternVar") {
          hasWildcard = true;
        }
      }

      if (!hasWildcard) {
        const missing = scrutineeType.fieldTypes
          .filter((field) => !coveredLabels.has(field.label))
          .map((field) => field.label);
        if (missing.length > 0) {
          return errors.nonexhaustiveMatchPatterns(missing, scrutineeExpr);
        }
      }
      break;
    }

    case "TypeBool": {
      let hasTrue = false;
      let hasFalse = false;
      for (const pattern of patterns) {
        const unwrapped = unwrapPattern(pattern);
        if (unwrapped.type === "PatternTrue") {
          hasTrue = true;
        } else if (unwrapped.type === "PatternFalse") {
          hasFalse = true;
        } else if (unwrapped.type === "PatternVar") {
          hasTrue = true;
          hasFalse = true;
        }
      }

      const missing: string[] = [];
      if (!hasTrue) {
        missing.push("true");
      }
      if (!hasFalse) {
        missing.push("false");
      }
      if (missing.length > 0) {
        return errors.nonexhaustiveMatchPatterns(missing, scrutineeExpr);
      }
      break;
    }

    case "TypeNat": {
      if (!natPatternsExhaustive(patterns)) {
        return errors.nonexhaustiveMatchPatterns(["0", "succ (__something__)"], scrutineeExpr);
      }
      break;
    }

    case "TypeList": {
      if (!listPatternsExhaustive(scrutineeType, patterns)) {
        return errors.nonexhaustiveMatchPatterns(
          ["[]", "cons (__something__, __something__)"],
          scrutineeExpr
        );
      }
      break;
    }

    default:
      break;
  }
}
