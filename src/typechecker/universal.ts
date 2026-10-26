import type { Identifier, Type } from "../ast";
import { errors } from "../errors";
import { normalizeType } from "./inference";
import type { TypecheckContext } from "./types";

function collectFreeTypeVariables(type: Type, bound: ReadonlySet<string> = new Set()): Set<string> {
  switch (type.type) {
    case "TypeVar":
      return bound.has(type.name) || type.name.startsWith("?T") ? new Set() : new Set([type.name]);
    case "TypeFun": {
      const names = new Set<string>();
      for (const parameter of type.parametersTypes) {
        for (const name of collectFreeTypeVariables(parameter, bound)) {
          names.add(name);
        }
      }
      for (const name of collectFreeTypeVariables(type.returnType, bound)) {
        names.add(name);
      }
      return names;
    }
    case "TypeSum": {
      const names = collectFreeTypeVariables(type.left, bound);
      for (const name of collectFreeTypeVariables(type.right, bound)) {
        names.add(name);
      }
      return names;
    }
    case "TypeTuple": {
      const names = new Set<string>();
      for (const item of type.types) {
        for (const name of collectFreeTypeVariables(item, bound)) {
          names.add(name);
        }
      }
      return names;
    }
    case "TypeRecord": {
      const names = new Set<string>();
      for (const field of type.fieldTypes) {
        for (const name of collectFreeTypeVariables(field.fieldType, bound)) {
          names.add(name);
        }
      }
      return names;
    }
    case "TypeVariant": {
      const names = new Set<string>();
      for (const field of type.fieldTypes) {
        if (!field.fieldType) {
          continue;
        }
        for (const name of collectFreeTypeVariables(field.fieldType, bound)) {
          names.add(name);
        }
      }
      return names;
    }
    case "TypeList":
      return collectFreeTypeVariables(type.elementType, bound);
    case "TypeRef":
      return collectFreeTypeVariables(type.referredType, bound);
    case "TypeRec": {
      const nextBound = new Set(bound);
      nextBound.add(type.var);
      return collectFreeTypeVariables(type.recType, nextBound);
    }
    case "TypeForAll": {
      const nextBound = new Set(bound);
      for (const typeVar of type.typeVars) {
        nextBound.add(typeVar);
      }
      return collectFreeTypeVariables(type.body, nextBound);
    }
    case "RecordFieldType":
      return collectFreeTypeVariables(type.fieldType, bound);
    case "VariantFieldType":
      return type.fieldType ? collectFreeTypeVariables(type.fieldType, bound) : new Set();
    default:
      return new Set();
  }
}

function makeFreshTypeName(baseName: string, usedNames: ReadonlySet<string>): string {
  let suffix = 1;
  let candidate = `${baseName}${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}${suffix}`;
  }
  return candidate;
}

function renameTypeVariable(type: Type, from: string, to: string): Type {
  switch (type.type) {
    case "TypeVar":
      return type.name === from ? { type: "TypeVar", name: to } : type;
    case "TypeFun":
      return {
        type: "TypeFun",
        parametersTypes: type.parametersTypes.map((parameter) =>
          renameTypeVariable(parameter, from, to)
        ),
        returnType: renameTypeVariable(type.returnType, from, to),
      };
    case "TypeSum":
      return {
        type: "TypeSum",
        left: renameTypeVariable(type.left, from, to),
        right: renameTypeVariable(type.right, from, to),
      };
    case "TypeTuple":
      return {
        type: "TypeTuple",
        types: type.types.map((item) => renameTypeVariable(item, from, to)),
      };
    case "TypeRecord":
      return {
        type: "TypeRecord",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "RecordFieldType",
          label: field.label,
          fieldType: renameTypeVariable(field.fieldType, from, to),
        })),
      };
    case "TypeVariant":
      return {
        type: "TypeVariant",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "VariantFieldType",
          label: field.label,
          fieldType: field.fieldType ? renameTypeVariable(field.fieldType, from, to) : undefined,
        })),
      };
    case "TypeList":
      return {
        type: "TypeList",
        elementType: renameTypeVariable(type.elementType, from, to),
      };
    case "TypeRef":
      return {
        type: "TypeRef",
        referredType: renameTypeVariable(type.referredType, from, to),
      };
    case "TypeRec":
      if (type.var === from) {
        return type;
      }
      return {
        type: "TypeRec",
        var: type.var,
        recType: renameTypeVariable(type.recType, from, to),
      };
    case "TypeForAll":
      if (type.typeVars.includes(from)) {
        return type;
      }
      return {
        type: "TypeForAll",
        typeVars: [...type.typeVars],
        body: renameTypeVariable(type.body, from, to),
      };
    case "RecordFieldType":
      return {
        type: "RecordFieldType",
        label: type.label,
        fieldType: renameTypeVariable(type.fieldType, from, to),
      };
    case "VariantFieldType":
      return {
        type: "VariantFieldType",
        label: type.label,
        fieldType: type.fieldType ? renameTypeVariable(type.fieldType, from, to) : undefined,
      };
    default:
      return type;
  }
}

function substituteTypeVariables(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  switch (type.type) {
    case "TypeVar":
      return substitutions.get(type.name) ?? type;
    case "TypeFun":
      return {
        type: "TypeFun",
        parametersTypes: type.parametersTypes.map((parameter) =>
          substituteTypeVariables(parameter, substitutions)
        ),
        returnType: substituteTypeVariables(type.returnType, substitutions),
      };
    case "TypeSum":
      return {
        type: "TypeSum",
        left: substituteTypeVariables(type.left, substitutions),
        right: substituteTypeVariables(type.right, substitutions),
      };
    case "TypeTuple":
      return {
        type: "TypeTuple",
        types: type.types.map((item) => substituteTypeVariables(item, substitutions)),
      };
    case "TypeRecord":
      return {
        type: "TypeRecord",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "RecordFieldType",
          label: field.label,
          fieldType: substituteTypeVariables(field.fieldType, substitutions),
        })),
      };
    case "TypeVariant":
      return {
        type: "TypeVariant",
        fieldTypes: type.fieldTypes.map((field) => ({
          type: "VariantFieldType",
          label: field.label,
          fieldType: field.fieldType
            ? substituteTypeVariables(field.fieldType, substitutions)
            : undefined,
        })),
      };
    case "TypeList":
      return {
        type: "TypeList",
        elementType: substituteTypeVariables(type.elementType, substitutions),
      };
    case "TypeRef":
      return {
        type: "TypeRef",
        referredType: substituteTypeVariables(type.referredType, substitutions),
      };
    case "TypeRec":
      if (substitutions.has(type.var)) {
        const nextSubstitutions = new Map(substitutions);
        nextSubstitutions.delete(type.var);
        return {
          type: "TypeRec",
          var: type.var,
          recType: substituteTypeVariables(type.recType, nextSubstitutions),
        };
      }
      return {
        type: "TypeRec",
        var: type.var,
        recType: substituteTypeVariables(type.recType, substitutions),
      };
    case "TypeForAll": {
      let body = type.body;
      let typeVars = [...type.typeVars];
      const nextSubstitutions = new Map(substitutions);
      const usedNames = new Set<string>([
        ...collectFreeTypeVariables(body),
        ...Array.from(substitutions.values()).flatMap((value) =>
          Array.from(collectFreeTypeVariables(value))
        ),
      ]);

      for (let index = 0; index < typeVars.length; index += 1) {
        const typeVar = typeVars[index];
        nextSubstitutions.delete(typeVar);
        if (usedNames.has(typeVar)) {
          const replacement = makeFreshTypeName(typeVar, usedNames);
          usedNames.add(replacement);
          body = renameTypeVariable(body, typeVar, replacement);
          typeVars[index] = replacement;
        }
      }

      return {
        type: "TypeForAll",
        typeVars,
        body: substituteTypeVariables(body, nextSubstitutions),
      };
    }
    case "RecordFieldType":
      return {
        type: "RecordFieldType",
        label: type.label,
        fieldType: substituteTypeVariables(type.fieldType, substitutions),
      };
    case "VariantFieldType":
      return {
        type: "VariantFieldType",
        label: type.label,
        fieldType: type.fieldType
          ? substituteTypeVariables(type.fieldType, substitutions)
          : undefined,
      };
    default:
      return type;
  }
}

export function validateTypeVariables(
  type: Type,
  context: TypecheckContext,
  boundTypeVariables: ReadonlySet<string> = context.typeVariables
): void {
  const normalized = normalizeType(type, context);
  switch (normalized.type) {
    case "TypeVar":
      if (!normalized.name.startsWith("?T") && !boundTypeVariables.has(normalized.name)) {
        return errors.undefinedTypeVariable(normalized.name, type);
      }
      break;
    case "TypeFun":
      normalized.parametersTypes.forEach((parameter) =>
        validateTypeVariables(parameter, context, boundTypeVariables)
      );
      validateTypeVariables(normalized.returnType, context, boundTypeVariables);
      break;
    case "TypeSum":
      validateTypeVariables(normalized.left, context, boundTypeVariables);
      validateTypeVariables(normalized.right, context, boundTypeVariables);
      break;
    case "TypeTuple":
      normalized.types.forEach((item) => validateTypeVariables(item, context, boundTypeVariables));
      break;
    case "TypeRecord":
      normalized.fieldTypes.forEach((field) =>
        validateTypeVariables(field.fieldType, context, boundTypeVariables)
      );
      break;
    case "TypeVariant":
      normalized.fieldTypes.forEach((field) => {
        if (field.fieldType) {
          validateTypeVariables(field.fieldType, context, boundTypeVariables);
        }
      });
      break;
    case "TypeList":
      validateTypeVariables(normalized.elementType, context, boundTypeVariables);
      break;
    case "TypeRef":
      validateTypeVariables(normalized.referredType, context, boundTypeVariables);
      break;
    case "TypeRec": {
      const nextBoundVariables = new Set(boundTypeVariables);
      nextBoundVariables.add(normalized.var);
      validateTypeVariables(normalized.recType, context, nextBoundVariables);
      break;
    }
    case "TypeForAll": {
      const nextBoundVariables = new Set(boundTypeVariables);
      const seenTypeVariables = new Set<string>();
      for (const typeVar of normalized.typeVars) {
        if (seenTypeVariables.has(typeVar)) {
          return errors.duplicateTypeParameter(typeVar, type);
        }
        seenTypeVariables.add(typeVar);
        nextBoundVariables.add(typeVar);
      }
      validateTypeVariables(normalized.body, context, nextBoundVariables);
      break;
    }
    case "RecordFieldType":
      validateTypeVariables(normalized.fieldType, context, boundTypeVariables);
      break;
    case "VariantFieldType":
      if (normalized.fieldType) {
        validateTypeVariables(normalized.fieldType, context, boundTypeVariables);
      }
      break;
    default:
      break;
  }
}

export function wrapInUniversalType(typeParams: readonly Identifier[], body: Type): Type {
  return typeParams.length === 0
    ? body
    : {
        type: "TypeForAll",
        typeVars: [...typeParams],
        body,
      };
}

export function instantiateUniversalType(
  type: Type,
  typeArguments: readonly Type[],
  context: TypecheckContext,
  node?: object
): Type {
  const normalizedArguments = typeArguments.map((typeArgument) =>
    normalizeType(typeArgument, context)
  );
  normalizedArguments.forEach((typeArgument, index) =>
    validateTypeVariables(typeArguments[index], context)
  );

  if (type.type !== "TypeForAll") {
    return errors.notAGenericFunction(node as never, type, node as never);
  }

  if (type.typeVars.length !== normalizedArguments.length) {
    return errors.incorrectNumberOfTypeArguments(
      type.typeVars.length,
      normalizedArguments.length,
      node
    );
  }

  const substitutions = new Map<string, Type>();
  type.typeVars.forEach((typeVar, index) => {
    substitutions.set(typeVar, normalizedArguments[index]);
  });

  return substituteTypeVariables(type.body, substitutions);
}
