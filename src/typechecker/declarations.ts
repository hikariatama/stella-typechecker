import type { Decl, DeclFun, DeclFunGeneric, Type } from "../ast";
import { errors } from "../errors";
import { makeTypeFun, TYPE_UNIT } from "../type-utils";
import { checkDuplicatesInFunctionDecl, checkDuplicatesInType } from "./duplicates";
import { normalizeExpectedType, normalizeType } from "./inference";
import { typecheckExpr } from "./expr";
import type { TypecheckObserver } from "./observer";
import { validateTypeVariables, wrapInUniversalType } from "./universal";
import {
  bindTypeParameters,
  withEnv,
  withTypeVariables,
  type TypecheckContext,
  type TypeEnv,
} from "./types";

export function getFunctionType(decl: DeclFun | DeclFunGeneric, context: TypecheckContext): Type {
  const boundTypeParameters =
    decl.type === "DeclFunGeneric" ? bindTypeParameters(context, decl.typeParams) : undefined;
  const typeContext = boundTypeParameters?.context ?? context;
  const paramTypes = decl.parameters.map((parameter) =>
    normalizeType(parameter.paramType, typeContext)
  );
  const returnType = normalizeExpectedType(decl.returnType, typeContext) ?? TYPE_UNIT;
  const functionType = makeTypeFun(paramTypes, returnType);
  return decl.type === "DeclFunGeneric"
    ? wrapInUniversalType(boundTypeParameters!.renamedTypeParams, functionType)
    : functionType;
}

export function typecheckDecl(
  decl: Decl,
  context: TypecheckContext,
  observer?: TypecheckObserver
): void {
  switch (decl.type) {
    case "DeclFun":
      typecheckFunctionDecl(decl, context, observer);
      break;
    case "DeclFunGeneric":
      typecheckGenericFunctionDecl(decl, context, observer);
      break;
    case "DeclExceptionType":
    case "DeclExceptionVariant":
      break;
    case "DeclTypeAlias":
      return errors.unsupportedDeclaration(decl.type, decl);
  }
}

function typecheckFunctionDecl(
  decl: DeclFun | DeclFunGeneric,
  context: TypecheckContext,
  observer?: TypecheckObserver
): void {
  const localEnv: TypeEnv = new Map(context.env);
  const boundTypeParameters =
    decl.type === "DeclFunGeneric" ? bindTypeParameters(context, decl.typeParams) : undefined;
  const scopedContext = boundTypeParameters?.context ?? context;
  const localTypeVariables = new Set(scopedContext.typeVariables);

  for (const parameter of decl.parameters) {
    checkDuplicatesInType(parameter.paramType);
    validateTypeVariables(parameter.paramType, scopedContext, localTypeVariables);
    localEnv.set(parameter.name, normalizeType(parameter.paramType, scopedContext));
  }

  for (const nestedDecl of decl.nestedDeclarations) {
    if (nestedDecl.type !== "DeclFun" && nestedDecl.type !== "DeclFunGeneric") {
      return errors.unsupportedDeclaration(nestedDecl.type, nestedDecl);
    }
    checkDuplicatesInFunctionDecl(nestedDecl);
    localEnv.set(
      nestedDecl.name,
      getFunctionType(nestedDecl, withTypeVariables(scopedContext, localTypeVariables))
    );
  }

  const localContext = withTypeVariables(withEnv(scopedContext, localEnv), localTypeVariables);
  for (const nestedDecl of decl.nestedDeclarations) {
    typecheckDecl(nestedDecl, localContext, observer);
  }

  const expectedReturnType = normalizeExpectedType(decl.returnType, localContext) ?? TYPE_UNIT;
  if (decl.returnType) {
    checkDuplicatesInType(decl.returnType);
    validateTypeVariables(decl.returnType, localContext, localTypeVariables);
  }
  typecheckExpr(decl.returnValue, localContext, expectedReturnType, observer);
}

function typecheckGenericFunctionDecl(
  decl: DeclFunGeneric,
  context: TypecheckContext,
  observer?: TypecheckObserver
): void {
  typecheckFunctionDecl(decl, context, observer);
}
