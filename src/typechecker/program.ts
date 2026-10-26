import type {
  Decl,
  DeclExceptionType,
  DeclFun,
  Program,
  Type,
  TypeVariant,
  VariantFieldType,
} from "../ast";
import { errors } from "../errors";
import { TYPE_UNIT } from "../type-utils";
import {
  createInferenceState,
  hasUnresolvedTypeVariables,
  normalizeExpectedType,
  normalizeType,
  requireConcreteType,
  resolveType,
} from "./inference";
import { getFunctionType, typecheckDecl } from "./declarations";
import { checkDuplicatesInFunctionDecl, checkDuplicatesInType } from "./duplicates";
import type { TypecheckObserver } from "./observer";
import { createTypecheckContext, type TypeEnv } from "./types";
import { validateTypeVariables } from "./universal";

function validateLocalExceptionDeclarations(declarations: Decl[]): void {
  for (const declaration of declarations) {
    if (declaration.type === "DeclExceptionType") {
      return errors.illegalLocalExceptionType(declaration);
    }

    if (declaration.type === "DeclExceptionVariant") {
      return errors.illegalLocalOpenVariantException(declaration);
    }

    if (
      (declaration.type === "DeclFun" || declaration.type === "DeclFunGeneric") &&
      declaration.nestedDeclarations.length > 0
    ) {
      validateLocalExceptionDeclarations(declaration.nestedDeclarations);
    }
  }
}

function resolveExceptionType(
  program: Program,
  context: ReturnType<typeof createTypecheckContext>
): Type | undefined {
  let closedExceptionDeclaration: DeclExceptionType | undefined;
  const openVariantFields: VariantFieldType[] = [];
  const seenVariantLabels = new Set<string>();

  for (const declaration of program.declarations) {
    switch (declaration.type) {
      case "DeclExceptionType":
        checkDuplicatesInType(declaration.exceptionType);
        validateTypeVariables(declaration.exceptionType, context);
        if (closedExceptionDeclaration) {
          return errors.duplicateExceptionType(declaration);
        }
        if (openVariantFields.length > 0) {
          return errors.conflictingExceptionDeclarations(declaration);
        }
        closedExceptionDeclaration = declaration;
        break;

      case "DeclExceptionVariant":
        checkDuplicatesInType(declaration.variantType);
        validateTypeVariables(declaration.variantType, context);
        if (closedExceptionDeclaration) {
          return errors.conflictingExceptionDeclarations(declaration);
        }
        if (seenVariantLabels.has(declaration.name)) {
          return errors.duplicateExceptionVariant(declaration.name, declaration);
        }
        seenVariantLabels.add(declaration.name);
        openVariantFields.push({
          type: "VariantFieldType",
          label: declaration.name,
          fieldType: normalizeType(declaration.variantType, context),
        });
        break;

      case "DeclFun":
      case "DeclFunGeneric":
        validateLocalExceptionDeclarations(declaration.nestedDeclarations);
        break;
    }
  }

  if (closedExceptionDeclaration) {
    return normalizeType(closedExceptionDeclaration.exceptionType, context);
  }

  if (openVariantFields.length === 0) {
    return undefined;
  }

  const exceptionType: TypeVariant = {
    type: "TypeVariant",
    fieldTypes: openVariantFields,
  };

  return exceptionType;
}

export function typecheckProgram(ast: Program, observer?: TypecheckObserver): void {
  const globalEnv: TypeEnv = new Map();
  const inference = ast.extensions.includes("#type-reconstruction")
    ? createInferenceState()
    : undefined;
  const context = createTypecheckContext(globalEnv, ast.extensions, undefined, inference);

  for (const declaration of ast.declarations) {
    if (declaration.type === "DeclFun" || declaration.type === "DeclFunGeneric") {
      checkDuplicatesInFunctionDecl(declaration);
      globalEnv.set(declaration.name, getFunctionType(declaration, context));
    }
  }

  const mainDecl = ast.declarations.find(
    (declaration): declaration is DeclFun =>
      declaration.type === "DeclFun" && declaration.name === "main"
  );

  if (!mainDecl) {
    return errors.missingMain();
  }

  const mainType = globalEnv.get("main");
  if (!mainType || mainType.type !== "TypeFun") {
    return errors.incorrectTypeOfMain(resolveType(mainType ?? TYPE_UNIT, context), mainDecl);
  }

  if (mainDecl.parameters.length !== 1) {
    return errors.incorrectArityOfMain(mainDecl.parameters.length, mainDecl);
  }

  context.exceptionType = resolveExceptionType(ast, context);

  for (const declaration of ast.declarations) {
    typecheckDecl(declaration, context, observer);
  }

  if (context.exceptionType) {
    requireConcreteType(context.exceptionType, context, ast);
  }

  for (const declaration of ast.declarations) {
    if (declaration.type !== "DeclFun" && declaration.type !== "DeclFunGeneric") {
      continue;
    }

    for (const parameter of declaration.parameters) {
      const parameterType = normalizeType(parameter.paramType, context);
      if (hasUnresolvedTypeVariables(parameterType, context)) {
        return errors.ambiguousType(parameter.paramType);
      }
    }

    const returnType = normalizeExpectedType(declaration.returnType, context);
    if (returnType && hasUnresolvedTypeVariables(returnType, context)) {
      return errors.ambiguousType(declaration.returnType);
    }
  }
}
