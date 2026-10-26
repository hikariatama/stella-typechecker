import type { Extension, Identifier, Type } from "../ast";
import type { InferenceState } from "./inference";

export type TypeEnv = Map<Identifier, Type>;
export type TypingMethod = "bottom-up" | "top-down" | "bidirectional";

export interface TypecheckContext {
  env: TypeEnv;
  extensions: Set<Extension>;
  exceptionType?: Type;
  inference?: InferenceState;
  typeVariables: Set<Identifier>;
  typeBindings: Map<Identifier, Identifier>;
  typeBindingCounter: { value: number };
}

export function createTypecheckContext(
  env: TypeEnv,
  extensions: Iterable<Extension>,
  exceptionType?: Type,
  inference?: InferenceState,
  typeVariables: Iterable<Identifier> = []
): TypecheckContext {
  const enabledExtensions = new Set(extensions);
  return {
    env,
    extensions: enabledExtensions,
    exceptionType,
    inference,
    typeVariables: new Set(typeVariables),
    typeBindings: new Map(),
    typeBindingCounter: { value: 1 },
  };
}

export function withEnv(context: TypecheckContext, env: TypeEnv): TypecheckContext {
  return {
    ...context,
    env,
  };
}

export function withTypeVariables(
  context: TypecheckContext,
  typeVariables: Iterable<Identifier>
): TypecheckContext {
  return {
    ...context,
    typeVariables: new Set(typeVariables),
  };
}

export function withTypeBindings(
  context: TypecheckContext,
  typeBindings: Map<Identifier, Identifier>,
  typeVariables: Iterable<Identifier> = context.typeVariables
): TypecheckContext {
  return {
    ...context,
    typeBindings,
    typeVariables: new Set(typeVariables),
  };
}

export function bindTypeParameters(
  context: TypecheckContext,
  typeParams: readonly Identifier[]
): { context: TypecheckContext; renamedTypeParams: Identifier[] } {
  const nextBindings = new Map(context.typeBindings);
  const nextTypeVariables = new Set(context.typeVariables);
  const renamedTypeParams: Identifier[] = [];

  for (const typeParam of typeParams) {
    const renamedTypeParam = `${typeParam}$${context.typeBindingCounter.value}`;
    context.typeBindingCounter.value += 1;
    nextBindings.set(typeParam, renamedTypeParam);
    nextTypeVariables.add(renamedTypeParam);
    renamedTypeParams.push(renamedTypeParam);
  }

  return {
    context: withTypeBindings(context, nextBindings, nextTypeVariables),
    renamedTypeParams,
  };
}
