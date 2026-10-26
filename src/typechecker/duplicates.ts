import type { DeclFun, DeclFunGeneric, Type } from "../ast";
import { errors } from "../errors";

export function checkDuplicatesInFunctionDecl(decl: DeclFun | DeclFunGeneric): void {
  if (decl.type === "DeclFunGeneric") {
    const seenTypeParameters = new Set<string>();
    for (const typeParam of decl.typeParams) {
      if (seenTypeParameters.has(typeParam)) {
        return errors.duplicateTypeParameter(typeParam, decl);
      }
      seenTypeParameters.add(typeParam);
    }
  }
  if (decl.returnType) {
    checkDuplicatesInType(decl.returnType);
  }
  for (const param of decl.parameters) {
    checkDuplicatesInType(param.paramType);
  }
}

export function checkDuplicatesInType(type: Type): void {
  switch (type.type) {
    case "TypeNat":
    case "TypeBool":
    case "TypeUnit":
    case "TypeTop":
    case "TypeBottom":
    case "TypeAuto":
    case "TypeVar":
      break;
    case "TypeRecord": {
      const labels = new Set<string>();
      for (const field of type.fieldTypes) {
        if (labels.has(field.label)) {
          return errors.duplicateRecordTypeFields(field.label, type);
        }
        labels.add(field.label);
        checkDuplicatesInType(field.fieldType);
      }
      break;
    }
    case "TypeVariant": {
      const labels = new Set<string>();
      for (const field of type.fieldTypes) {
        if (labels.has(field.label)) {
          return errors.duplicateVariantTypeFields(field.label, type);
        }
        labels.add(field.label);
        if (field.fieldType) {
          checkDuplicatesInType(field.fieldType);
        }
      }
      break;
    }
    case "TypeFun": {
      for (const param of type.parametersTypes) {
        checkDuplicatesInType(param);
      }
      checkDuplicatesInType(type.returnType);
      break;
    }
    case "TypeTuple": {
      for (const t of type.types) {
        checkDuplicatesInType(t);
      }
      break;
    }
    case "TypeSum": {
      checkDuplicatesInType(type.left);
      checkDuplicatesInType(type.right);
      break;
    }
    case "TypeList": {
      checkDuplicatesInType(type.elementType);
      break;
    }
    case "TypeRef": {
      checkDuplicatesInType(type.referredType);
      break;
    }
    case "TypeRec": {
      checkDuplicatesInType(type.recType);
      break;
    }
    case "TypeForAll": {
      const seenTypeParameters = new Set<string>();
      for (const typeParam of type.typeVars) {
        if (seenTypeParameters.has(typeParam)) {
          return errors.duplicateTypeParameter(typeParam, type);
        }
        seenTypeParameters.add(typeParam);
      }
      checkDuplicatesInType(type.body);
      break;
    }
    default:
      return errors.unsupportedType(type);
  }
}
