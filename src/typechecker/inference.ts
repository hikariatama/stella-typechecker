import type {
  Expr,
  Type,
  TypeFun,
  TypeList,
  TypeRecord,
  TypeRef,
  TypeSum,
  TypeTuple,
  TypeVar,
  TypeVariant,
} from "../ast";
import { errors } from "../errors";
import { makeTypeFun, makeTypeList } from "../type-utils";
import { bindTypeParameters, type TypecheckContext } from "./types";

export interface InferenceState {
  nextTypeVarId: number;
  normalizedTypes: WeakMap<object, Type>;
  substitutions: Map<string, Type>;
}

export function createInferenceState(): InferenceState {
  return {
    nextTypeVarId: 1,
    normalizedTypes: new WeakMap<object, Type>(),
    substitutions: new Map(),
  };
}

export function hasTypeReconstruction(context: TypecheckContext): boolean {
  return context.inference !== undefined;
}

export function isInferenceTypeVarName(name: string): boolean {
  return name.startsWith("?T");
}

export function isInferenceTypeVar(type: Type): boolean {
  return type.type === "TypeVar" && isInferenceTypeVarName(type.name);
}

export function freshInferenceTypeVar(context: TypecheckContext): TypeVar {
  const inference = context.inference;
  if (!inference) {
    return { type: "TypeVar", name: "?T0" };
  }
  const id = inference.nextTypeVarId;
  inference.nextTypeVarId += 1;
  return {
    type: "TypeVar",
    name: `?T${id}`,
  };
}

export function normalizeType(type: Type, context: TypecheckContext): Type {
  const inference = context.inference;
  if (inference) {
    const cached = inference.normalizedTypes.get(type as object);
    if (cached) {
      return cached;
    }
  }

  const normalized: Type = (() => {
    switch (type.type) {
      case "TypeAuto":
        return freshInferenceTypeVar(context);
      case "TypeVar":
        return context.typeBindings.get(type.name)
          ? { type: "TypeVar", name: context.typeBindings.get(type.name)! }
          : type;
      case "TypeFun":
        return {
          type: "TypeFun",
          parametersTypes: type.parametersTypes.map((parameter) =>
            normalizeType(parameter, context)
          ),
          returnType: normalizeType(type.returnType, context),
        } satisfies TypeFun;
      case "TypeSum":
        return {
          type: "TypeSum",
          left: normalizeType(type.left, context),
          right: normalizeType(type.right, context),
        } satisfies TypeSum;
      case "TypeTuple":
        return {
          type: "TypeTuple",
          types: type.types.map((item) => normalizeType(item, context)),
        } satisfies TypeTuple;
      case "TypeRecord":
        return {
          type: "TypeRecord",
          fieldTypes: type.fieldTypes.map((field) => ({
            type: "RecordFieldType" as const,
            label: field.label,
            fieldType: normalizeType(field.fieldType, context),
          })),
        } satisfies TypeRecord;
      case "TypeVariant":
        return {
          type: "TypeVariant",
          fieldTypes: type.fieldTypes.map((field) => ({
            type: "VariantFieldType" as const,
            label: field.label,
            fieldType: field.fieldType ? normalizeType(field.fieldType, context) : undefined,
          })),
        } satisfies TypeVariant;
      case "TypeList":
        return makeTypeList(normalizeType(type.elementType, context));
      case "TypeRef":
        return {
          type: "TypeRef",
          referredType: normalizeType(type.referredType, context),
        } satisfies TypeRef;
      case "TypeRec":
        return {
          type: "TypeRec",
          var: type.var,
          recType: normalizeType(type.recType, context),
        } satisfies Type;
      case "TypeForAll": {
        const boundTypeParameters = bindTypeParameters(context, type.typeVars);
        return {
          type: "TypeForAll",
          typeVars: boundTypeParameters.renamedTypeParams,
          body: normalizeType(type.body, boundTypeParameters.context),
        } satisfies Type;
      }
      case "RecordFieldType":
        return {
          type: "RecordFieldType" as const,
          label: type.label,
          fieldType: normalizeType(type.fieldType, context),
        };
      case "VariantFieldType":
        return {
          type: "VariantFieldType" as const,
          label: type.label,
          fieldType: type.fieldType ? normalizeType(type.fieldType, context) : undefined,
        };
      default:
        return type;
    }
  })();

  inference?.normalizedTypes.set(type as object, normalized);
  return normalized;
}

export function resolveType(type: Type, context: TypecheckContext): Type {
  const inference = context.inference;
  if (!inference) {
    return type;
  }

  if (isInferenceTypeVar(type)) {
    const replacement = inference.substitutions.get((type as TypeVar).name);
    if (!replacement) {
      return type;
    }
    const resolved = resolveType(replacement, context);
    inference.substitutions.set((type as TypeVar).name, resolved);
    return resolved;
  }

  switch (type.type) {
    case "TypeFun":
      return {
        type: "TypeFun",
        parametersTypes: type.parametersTypes.map((parameter) => resolveType(parameter, context)),
        returnType: resolveType(type.returnType, context),
      };
    case "TypeSum":
      return {
        type: "TypeSum",
        left: resolveType(type.left, context),
        right: resolveType(type.right, context),
      };
    case "TypeTuple":
      return {
        type: "TypeTuple",
        types: type.types.map((item) => resolveType(item, context)),
      };
    case "TypeRecord":
      return {
        type: "TypeRecord",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "RecordFieldType",
          label: field.label,
          fieldType: resolveType(field.fieldType, context),
        })),
      };
    case "TypeVariant":
      return {
        type: "TypeVariant",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "VariantFieldType",
          label: field.label,
          fieldType: field.fieldType ? resolveType(field.fieldType, context) : undefined,
        })),
      };
    case "TypeList":
      return {
        type: "TypeList",
        elementType: resolveType(type.elementType, context),
      };
    case "TypeRef":
      return {
        type: "TypeRef",
        referredType: resolveType(type.referredType, context),
      };
    case "TypeRec":
      return {
        type: "TypeRec",
        var: type.var,
        recType: resolveType(type.recType, context),
      };
    case "TypeForAll":
      return {
        type: "TypeForAll",
        typeVars: [...type.typeVars],
        body: resolveType(type.body, context),
      };
    case "RecordFieldType":
      return {
        type: "RecordFieldType",
        label: type.label,
        fieldType: resolveType(type.fieldType, context),
      };
    case "VariantFieldType":
      return {
        type: "VariantFieldType",
        label: type.label,
        fieldType: type.fieldType ? resolveType(type.fieldType, context) : undefined,
      };
    default:
      return type;
  }
}

function occursInType(typeVarName: string, type: Type, context: TypecheckContext): boolean {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    return (resolved as TypeVar).name === typeVarName;
  }

  switch (resolved.type) {
    case "TypeFun":
      return (
        resolved.parametersTypes.some((parameter) =>
          occursInType(typeVarName, parameter, context)
        ) || occursInType(typeVarName, resolved.returnType, context)
      );
    case "TypeSum":
      return (
        occursInType(typeVarName, resolved.left, context) ||
        occursInType(typeVarName, resolved.right, context)
      );
    case "TypeTuple":
      return resolved.types.some((item) => occursInType(typeVarName, item, context));
    case "TypeRecord":
      return resolved.fieldTypes.some((field) =>
        occursInType(typeVarName, field.fieldType, context)
      );
    case "TypeVariant":
      return resolved.fieldTypes.some(
        (field) =>
          field.fieldType !== undefined && occursInType(typeVarName, field.fieldType, context)
      );
    case "TypeList":
      return occursInType(typeVarName, resolved.elementType, context);
    case "TypeRef":
      return occursInType(typeVarName, resolved.referredType, context);
    case "TypeRec":
      return occursInType(typeVarName, resolved.recType, context);
    case "TypeForAll":
      return occursInType(typeVarName, resolved.body, context);
    case "RecordFieldType":
      return occursInType(typeVarName, resolved.fieldType, context);
    case "VariantFieldType":
      return (
        resolved.fieldType !== undefined && occursInType(typeVarName, resolved.fieldType, context)
      );
    default:
      return false;
  }
}

function bindInferenceTypeVar(
  typeVarName: string,
  type: Type,
  context: TypecheckContext,
  node?: object
): void {
  const inference = context.inference;
  if (!inference) {
    return;
  }

  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved) && (resolved as TypeVar).name === typeVarName) {
    return;
  }

  if (occursInType(typeVarName, resolved, context)) {
    return errors.occursCheckInfiniteType(typeVarName, resolved, node);
  }

  inference.substitutions.set(typeVarName, resolved);
}

export function unifyTypes(
  left: Type,
  right: Type,
  context: TypecheckContext,
  node?: object
): boolean {
  const resolvedLeft = resolveType(left, context);
  const resolvedRight = resolveType(right, context);

  if (isInferenceTypeVar(resolvedLeft)) {
    bindInferenceTypeVar((resolvedLeft as TypeVar).name, resolvedRight, context, node);
    return true;
  }

  if (isInferenceTypeVar(resolvedRight)) {
    bindInferenceTypeVar((resolvedRight as TypeVar).name, resolvedLeft, context, node);
    return true;
  }

  if (resolvedLeft.type !== resolvedRight.type) {
    return false;
  }

  switch (resolvedLeft.type) {
    case "TypeNat":
    case "TypeBool":
    case "TypeUnit":
    case "TypeTop":
    case "TypeBottom":
    case "TypeAuto":
      return true;
    case "TypeVar":
      return resolvedLeft.name === (resolvedRight as TypeVar).name;
    case "TypeFun": {
      const rightFunction = resolvedRight as TypeFun;
      return (
        resolvedLeft.parametersTypes.length === rightFunction.parametersTypes.length &&
        resolvedLeft.parametersTypes.every((parameter, index) =>
          unifyTypes(parameter, rightFunction.parametersTypes[index], context, node)
        ) &&
        unifyTypes(resolvedLeft.returnType, rightFunction.returnType, context, node)
      );
    }
    case "TypeSum": {
      const rightSum = resolvedRight as TypeSum;
      return (
        unifyTypes(resolvedLeft.left, rightSum.left, context, node) &&
        unifyTypes(resolvedLeft.right, rightSum.right, context, node)
      );
    }
    case "TypeTuple": {
      const rightTuple = resolvedRight as TypeTuple;
      return (
        resolvedLeft.types.length === rightTuple.types.length &&
        resolvedLeft.types.every((item, index) =>
          unifyTypes(item, rightTuple.types[index], context, node)
        )
      );
    }
    case "TypeRecord": {
      const rightRecord = resolvedRight as TypeRecord;
      return (
        resolvedLeft.fieldTypes.length === rightRecord.fieldTypes.length &&
        resolvedLeft.fieldTypes.every((field) => {
          const otherField = rightRecord.fieldTypes.find(
            (candidate) => candidate.label === field.label
          );
          return (
            otherField !== undefined &&
            unifyTypes(field.fieldType, otherField.fieldType, context, node)
          );
        })
      );
    }
    case "TypeVariant": {
      const rightVariant = resolvedRight as TypeVariant;
      return (
        resolvedLeft.fieldTypes.length === rightVariant.fieldTypes.length &&
        resolvedLeft.fieldTypes.every((field) => {
          const otherField = rightVariant.fieldTypes.find(
            (candidate) => candidate.label === field.label
          );
          if (!otherField) {
            return false;
          }
          if (field.fieldType === undefined || otherField.fieldType === undefined) {
            return field.fieldType === otherField.fieldType;
          }
          return unifyTypes(field.fieldType, otherField.fieldType, context, node);
        })
      );
    }
    case "TypeList":
      return unifyTypes(
        resolvedLeft.elementType,
        (resolvedRight as TypeList).elementType,
        context,
        node
      );
    case "TypeRef":
      return unifyTypes(
        resolvedLeft.referredType,
        (resolvedRight as TypeRef).referredType,
        context,
        node
      );
    case "TypeRec": {
      const rightRec = resolvedRight as Extract<Type, { type: "TypeRec" }>;
      return (
        resolvedLeft.var === rightRec.var &&
        unifyTypes(resolvedLeft.recType, rightRec.recType, context, node)
      );
    }
    case "TypeForAll": {
      const rightForAll = resolvedRight as Extract<Type, { type: "TypeForAll" }>;
      return (
        resolvedLeft.typeVars.length === rightForAll.typeVars.length &&
        resolvedLeft.typeVars.every((name, index) => name === rightForAll.typeVars[index]) &&
        unifyTypes(resolvedLeft.body, rightForAll.body, context, node)
      );
    }
    case "RecordFieldType":
      return (
        resolvedLeft.label ===
          (resolvedRight as Extract<Type, { type: "RecordFieldType" }>).label &&
        unifyTypes(
          resolvedLeft.fieldType,
          (resolvedRight as Extract<Type, { type: "RecordFieldType" }>).fieldType,
          context,
          node
        )
      );
    case "VariantFieldType": {
      const rightVariantField = resolvedRight as Extract<Type, { type: "VariantFieldType" }>;
      if (resolvedLeft.label !== rightVariantField.label) {
        return false;
      }
      if (resolvedLeft.fieldType === undefined || rightVariantField.fieldType === undefined) {
        return resolvedLeft.fieldType === rightVariantField.fieldType;
      }
      return unifyTypes(resolvedLeft.fieldType, rightVariantField.fieldType, context, node);
    }
  }
}

export function ensureFunctionType(
  type: Type,
  arity: number,
  context: TypecheckContext
): TypeFun | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const parameterTypes = Array.from({ length: arity }, () => freshInferenceTypeVar(context));
    const functionType = makeTypeFun(parameterTypes, freshInferenceTypeVar(context));
    bindInferenceTypeVar((resolved as TypeVar).name, functionType, context);
    return resolveType(functionType, context) as TypeFun;
  }

  if (resolved.type !== "TypeFun" || resolved.parametersTypes.length !== arity) {
    return null;
  }

  return resolved;
}

export function ensureListType(type: Type, context: TypecheckContext): TypeList | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const listType = makeTypeList(freshInferenceTypeVar(context));
    bindInferenceTypeVar((resolved as TypeVar).name, listType, context);
    return resolveType(listType, context) as TypeList;
  }
  return resolved.type === "TypeList" ? resolved : null;
}

export function ensureRefType(type: Type, context: TypecheckContext): TypeRef | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const referenceType: TypeRef = {
      type: "TypeRef",
      referredType: freshInferenceTypeVar(context),
    };
    bindInferenceTypeVar((resolved as TypeVar).name, referenceType, context);
    return resolveType(referenceType, context) as TypeRef;
  }
  return resolved.type === "TypeRef" ? resolved : null;
}

export function ensureSumType(type: Type, context: TypecheckContext): TypeSum | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const sumType: TypeSum = {
      type: "TypeSum",
      left: freshInferenceTypeVar(context),
      right: freshInferenceTypeVar(context),
    };
    bindInferenceTypeVar((resolved as TypeVar).name, sumType, context);
    return resolveType(sumType, context) as TypeSum;
  }
  return resolved.type === "TypeSum" ? resolved : null;
}

export function ensureTupleType(
  type: Type,
  length: number,
  context: TypecheckContext,
  exactLength = true
): TypeTuple | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const tupleType: TypeTuple = {
      type: "TypeTuple",
      types: Array.from({ length }, () => freshInferenceTypeVar(context)),
    };
    bindInferenceTypeVar((resolved as TypeVar).name, tupleType, context);
    return resolveType(tupleType, context) as TypeTuple;
  }
  if (
    resolved.type !== "TypeTuple" ||
    (exactLength ? resolved.types.length !== length : resolved.types.length < length)
  ) {
    return null;
  }
  return resolved;
}

export function ensureRecordType(type: Type, context: TypecheckContext): TypeRecord | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const recordType: TypeRecord = {
      type: "TypeRecord",
      fieldTypes: [],
    };
    bindInferenceTypeVar((resolved as TypeVar).name, recordType, context);
    return resolveType(recordType, context) as TypeRecord;
  }
  return resolved.type === "TypeRecord" ? resolved : null;
}

export function ensureRecordFieldType(
  type: Type,
  label: string,
  context: TypecheckContext
): Type | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const recordType: TypeRecord = {
      type: "TypeRecord",
      fieldTypes: [
        {
          type: "RecordFieldType",
          label,
          fieldType: freshInferenceTypeVar(context),
        },
      ],
    };
    bindInferenceTypeVar((resolved as TypeVar).name, recordType, context);
    return recordType.fieldTypes[0].fieldType;
  }

  if (resolved.type !== "TypeRecord") {
    return null;
  }

  const field = resolved.fieldTypes.find((candidate) => candidate.label === label);
  return field?.fieldType ?? null;
}

export function ensureVariantType(type: Type, context: TypecheckContext): TypeVariant | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const variantType: TypeVariant = {
      type: "TypeVariant",
      fieldTypes: [],
    };
    bindInferenceTypeVar((resolved as TypeVar).name, variantType, context);
    return resolveType(variantType, context) as TypeVariant;
  }
  return resolved.type === "TypeVariant" ? resolved : null;
}

export function ensureVariantFieldType(
  type: Type,
  label: string,
  withPayload: boolean,
  context: TypecheckContext
): Type | undefined | null {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    const fieldType = withPayload ? freshInferenceTypeVar(context) : undefined;
    const variantType: TypeVariant = {
      type: "TypeVariant",
      fieldTypes: [
        {
          type: "VariantFieldType" as const,
          label,
          fieldType,
        },
      ],
    };
    bindInferenceTypeVar((resolved as TypeVar).name, variantType, context);
    return fieldType;
  }

  if (resolved.type !== "TypeVariant") {
    return null;
  }

  const field = resolved.fieldTypes.find((candidate) => candidate.label === label);
  if (!field) {
    return null;
  }
  return field.fieldType;
}

export function hasUnresolvedTypeVariables(type: Type, context: TypecheckContext): boolean {
  const resolved = resolveType(type, context);
  if (isInferenceTypeVar(resolved)) {
    return true;
  }

  switch (resolved.type) {
    case "TypeFun":
      return (
        resolved.parametersTypes.some((parameter) =>
          hasUnresolvedTypeVariables(parameter, context)
        ) || hasUnresolvedTypeVariables(resolved.returnType, context)
      );
    case "TypeSum":
      return (
        hasUnresolvedTypeVariables(resolved.left, context) ||
        hasUnresolvedTypeVariables(resolved.right, context)
      );
    case "TypeTuple":
      return resolved.types.some((item) => hasUnresolvedTypeVariables(item, context));
    case "TypeRecord":
      return resolved.fieldTypes.some((field) =>
        hasUnresolvedTypeVariables(field.fieldType, context)
      );
    case "TypeVariant":
      return resolved.fieldTypes.some(
        (field) =>
          field.fieldType !== undefined && hasUnresolvedTypeVariables(field.fieldType, context)
      );
    case "TypeList":
      return hasUnresolvedTypeVariables(resolved.elementType, context);
    case "TypeRef":
      return hasUnresolvedTypeVariables(resolved.referredType, context);
    case "TypeRec":
      return hasUnresolvedTypeVariables(resolved.recType, context);
    case "TypeForAll":
      return hasUnresolvedTypeVariables(resolved.body, context);
    case "RecordFieldType":
      return hasUnresolvedTypeVariables(resolved.fieldType, context);
    case "VariantFieldType":
      return (
        resolved.fieldType !== undefined && hasUnresolvedTypeVariables(resolved.fieldType, context)
      );
    default:
      return false;
  }
}

export function requireConcreteType(type: Type, context: TypecheckContext, node?: object): Type {
  const resolved = resolveType(type, context);
  if (hasUnresolvedTypeVariables(resolved, context)) {
    return errors.ambiguousType(node);
  }
  return resolved;
}

export function normalizeExpectedType(
  type: Type | undefined,
  context: TypecheckContext
): Type | undefined {
  if (type === undefined) {
    return undefined;
  }
  return normalizeType(type, context);
}

export function resolveExpressionType(type: Type, context: TypecheckContext, expr?: Expr): Type {
  const resolved = resolveType(type, context);
  if (expr && hasTypeReconstruction(context) && hasUnresolvedTypeVariables(resolved, context)) {
    return resolved;
  }
  return resolved;
}
