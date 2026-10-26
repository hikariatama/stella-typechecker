import type {
  Type,
  TypeBool,
  TypeFun,
  TypeList,
  TypeNat,
  TypeRecord,
  TypeSum,
  TypeTuple,
  TypeUnit,
  TypeVariant,
} from "./ast";

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

export function printType(type: Type): string {
  switch (type.type) {
    case "TypeNat":
      return "Nat";
    case "TypeBool":
      return "Bool";
    case "TypeUnit":
      return "Unit";
    case "TypeTop":
      return "Top";
    case "TypeBottom":
      return "Bot";
    case "TypeFun": {
      const params = type.parametersTypes.map(printType).join(", ");
      return `fn (${params}) -> ${printType(type.returnType)}`;
    }
    case "TypeSum":
      return `${printType(type.left)} + ${printType(type.right)}`;
    case "TypeTuple": {
      const types = type.types.map(printType).join(", ");
      return `{\n  ${types}\n}`;
    }
    case "TypeRecord": {
      const fields = type.fieldTypes
        .map((f) => `${f.label} : ${printType(f.fieldType)}`)
        .join(", ");
      return `{\n  ${fields}\n}`;
    }
    case "TypeVariant": {
      const fields = type.fieldTypes
        .map((f) => (f.fieldType ? `${f.label} : ${printType(f.fieldType)}` : f.label))
        .join(", ");
      return `<| ${fields} |>`;
    }
    case "TypeList":
      return `[${printType(type.elementType)}]`;
    case "TypeVar":
      return type.name;
    case "TypeRec":
      return `μ ${type.var} . ${printType(type.recType)}`;
    case "TypeRef":
      return `&${printType(type.referredType)}`;
    case "TypeForAll": {
      const vars = type.typeVars.join(" ");
      return `forall ${vars} . ${printType(type.body)}`;
    }
    case "TypeAuto":
      return "auto";
    case "RecordFieldType":
      return `${type.label} : ${printType(type.fieldType)}`;
    case "VariantFieldType":
      return type.fieldType ? `${type.label} : ${printType(type.fieldType)}` : type.label;
  }
}

export function typesEqual(t1: Type, t2: Type): boolean {
  if (t1.type !== t2.type) {
    return false;
  }
  switch (t1.type) {
    case "TypeNat":
    case "TypeBool":
    case "TypeUnit":
    case "TypeTop":
    case "TypeBottom":
    case "TypeAuto":
      return true;
    case "TypeFun": {
      const t2Fun = t2 as TypeFun;
      if (t1.parametersTypes.length !== t2Fun.parametersTypes.length) {
        return false;
      }
      for (let i = 0; i < t1.parametersTypes.length; i++) {
        if (!typesEqual(t1.parametersTypes[i], t2Fun.parametersTypes[i])) {
          return false;
        }
      }
      return typesEqual(t1.returnType, t2Fun.returnType);
    }
    case "TypeSum": {
      const t2Sum = t2 as TypeSum;
      return typesEqual(t1.left, t2Sum.left) && typesEqual(t1.right, t2Sum.right);
    }
    case "TypeTuple": {
      const t2Tuple = t2 as TypeTuple;
      if (t1.types.length !== t2Tuple.types.length) {
        return false;
      }
      for (let i = 0; i < t1.types.length; i++) {
        if (!typesEqual(t1.types[i], t2Tuple.types[i])) {
          return false;
        }
      }
      return true;
    }
    case "TypeRecord": {
      const t2Record = t2 as TypeRecord;
      if (t1.fieldTypes.length !== t2Record.fieldTypes.length) {
        return false;
      }
      for (const field of t1.fieldTypes) {
        const otherField = t2Record.fieldTypes.find((f) => f.label === field.label);
        if (!otherField || !typesEqual(field.fieldType, otherField.fieldType)) {
          return false;
        }
      }
      return true;
    }
    case "TypeVariant": {
      const t2Variant = t2 as TypeVariant;
      if (t1.fieldTypes.length !== t2Variant.fieldTypes.length) {
        return false;
      }
      for (const field of t1.fieldTypes) {
        const otherField = t2Variant.fieldTypes.find((f) => f.label === field.label);
        if (!otherField) {
          return false;
        }
        if (field.fieldType === undefined && otherField.fieldType === undefined) {
          continue;
        }
        if (field.fieldType === undefined || otherField.fieldType === undefined) {
          return false;
        }
        if (!typesEqual(field.fieldType, otherField.fieldType)) {
          return false;
        }
      }
      return true;
    }
    case "TypeList": {
      const t2List = t2 as TypeList;
      return typesEqual(t1.elementType, t2List.elementType);
    }
    case "TypeVar": {
      const t2Var = t2 as { type: "TypeVar"; name: string };
      return t1.name === t2Var.name;
    }
    case "TypeRec": {
      const t2Rec = t2 as { type: "TypeRec"; var: string; recType: Type };
      return t1.var === t2Rec.var && typesEqual(t1.recType, t2Rec.recType);
    }
    case "TypeRef": {
      const t2Ref = t2 as { type: "TypeRef"; referredType: Type };
      return typesEqual(t1.referredType, t2Ref.referredType);
    }
    case "TypeForAll": {
      const t2ForAll = t2 as { type: "TypeForAll"; typeVars: string[]; body: Type };
      if (t1.typeVars.length !== t2ForAll.typeVars.length) {
        return false;
      }
      let normalizedRightBody = t2ForAll.body;
      for (let i = 0; i < t1.typeVars.length; i++) {
        normalizedRightBody = renameTypeVariable(
          normalizedRightBody,
          t2ForAll.typeVars[i],
          t1.typeVars[i]
        );
      }
      return typesEqual(t1.body, normalizedRightBody);
    }
    case "RecordFieldType": {
      const t2Field = t2 as { type: "RecordFieldType"; label: string; fieldType: Type };
      return t1.label === t2Field.label && typesEqual(t1.fieldType, t2Field.fieldType);
    }
    case "VariantFieldType": {
      const t2Field = t2 as { type: "VariantFieldType"; label: string; fieldType?: Type };
      if (t1.label !== t2Field.label) return false;
      if (t1.fieldType === undefined && t2Field.fieldType === undefined) return true;
      if (t1.fieldType === undefined || t2Field.fieldType === undefined) return false;
      return typesEqual(t1.fieldType, t2Field.fieldType);
    }
  }
}

export const TYPE_NAT: TypeNat = { type: "TypeNat" };
export const TYPE_BOOL: TypeBool = { type: "TypeBool" };
export const TYPE_UNIT: TypeUnit = { type: "TypeUnit" };
export const TYPE_TOP: Type = { type: "TypeTop" };
export const TYPE_BOTTOM: Type = { type: "TypeBottom" };

export function makeTypeFun(paramTypes: Type[], returnType: Type): TypeFun {
  return { type: "TypeFun", parametersTypes: paramTypes, returnType };
}

export function makeTypeList(elementType: Type): TypeList {
  return { type: "TypeList", elementType };
}

export function makeTypeTuple(types: Type[]): TypeTuple {
  return { type: "TypeTuple", types };
}

export function makeTypeSum(left: Type, right: Type): TypeSum {
  return { type: "TypeSum", left, right };
}
