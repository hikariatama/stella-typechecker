import type { Expr, Pattern } from "./ast";
import { printType } from "./type-utils";

function formatReturnLine(exprText: string): string {
  const lines = exprText.split("\n");
  if (lines.length === 1) {
    return `return ${lines[0]}`;
  }

  return `return ${lines[0]}\n${lines
    .slice(1)
    .map((line) => `  ${line}`)
    .join("\n")}`;
}

function wrapForApplicationHead(expr: Expr): string {
  const rendered = printExpr(expr);
  if (expr.type !== "Abstraction") {
    return rendered;
  }
  if (rendered.includes("\n")) {
    return `(${rendered}\n)`;
  }
  return `(${rendered})`;
}

function wrapForApplicationArg(expr: Expr): string {
  const rendered = printExpr(expr);
  if (rendered.includes("\n")) {
    return `(${rendered}\n)`;
  }
  return `(${rendered})`;
}

export function printExpr(expr: Expr): string {
  switch (expr.type) {
    case "ConstBool":
      return expr.value ? "true" : "false";
    case "Unit":
      return "unit";
    case "ConstInt":
      return String(expr.value);
    case "ConstMemory":
      return expr.value;
    case "Var":
      return expr.name;
    case "Succ":
      return `succ (${printExpr(expr.expr)})`;
    case "NatPred":
      return `Nat::pred (${printExpr(expr.expr)})`;
    case "NatIsZero":
      return `Nat::iszero (${printExpr(expr.expr)})`;
    case "NatRec": {
      const stepExpr = printExpr(expr.step);
      if (stepExpr.includes("\n")) {
        const [first, ...rest] = stepExpr.split("\n");
        return `Nat::rec (${printExpr(expr.n)}, ${printExpr(expr.initial)}, ${first}\n${rest.join("\n")}\n)`;
      }
      return `Nat::rec (${printExpr(expr.n)}, ${printExpr(expr.initial)}, ${stepExpr})`;
    }
    case "Fix":
      return `fix (${printExpr(expr.expr)})`;
    case "Inl":
      return `inl (${printExpr(expr.expr)})`;
    case "Inr":
      return `inr (${printExpr(expr.expr)})`;
    case "Cons":
      return `cons (${printExpr(expr.head)}, ${printExpr(expr.tail)})`;
    case "ListHead":
      return `List::head (${printExpr(expr.expr)})`;
    case "ListTail":
      return `List::tail (${printExpr(expr.expr)})`;
    case "ListIsEmpty":
      return `List::isempty (${printExpr(expr.expr)})`;
    case "LogicalNot":
      return `not (${printExpr(expr.expr)})`;
    case "If":
      return `if ${printExpr(expr.condition)} then ${printExpr(expr.thenExpr)} else ${printExpr(expr.elseExpr)}`;
    case "Application": {
      const args = expr.arguments.map(wrapForApplicationArg).join(" ");
      return `${wrapForApplicationHead(expr.function)} ${args}`;
    }
    case "Abstraction": {
      const params = expr.parameters.map((p) => `${p.name} : ${printType(p.paramType)}`).join(", ");
      const returnValue = printExpr(expr.returnValue);
      return `fn (${params})\n{\n  ${formatReturnLine(returnValue)}\n}`;
    }
    case "TypeAscription":
      return `${printExpr(expr.expr)} as ${printType(expr.ascribedType)}`;
    case "Let": {
      const bindings = expr.patternBindings
        .map((b) => `${printPattern(b.pattern)} = ${printExpr(b.rhs)}`)
        .join(", ");
      return `let ${bindings} in ${printExpr(expr.body)}`;
    }
    case "LetRec": {
      const bindings = expr.patternBindings
        .map((b) => `${printPattern(b.pattern)} = ${printExpr(b.rhs)}`)
        .join(", ");
      return `letrec ${bindings} in ${printExpr(expr.body)}`;
    }
    case "Tuple": {
      const exprs = expr.exprs.map(printExpr).join(", ");
      return `{\n  ${exprs}\n}`;
    }
    case "DotTuple":
      return `${printExpr(expr.expr)} . ${expr.index}`;
    case "Record": {
      const bindings = expr.bindings.map((b) => `${b.name} = ${printExpr(b.expr)}`).join(", ");
      return `{\n  ${bindings}\n}`;
    }
    case "DotRecord":
      return `${printExpr(expr.expr)} . ${expr.label}`;
    case "Match": {
      const cases = expr.cases
        .map((c) => `${printPattern(c.pattern)} => ${printExpr(c.expr)}`)
        .join(" | ");
      return `match ${printExpr(expr.expr)} { ${cases} }`;
    }
    case "Variant":
      return expr.expr ? `<| ${expr.label} = ${printExpr(expr.expr)} |>` : `<| ${expr.label} |>`;
    case "List": {
      const exprs = expr.exprs.map(printExpr).join(", ");
      return `[${exprs}]`;
    }
    case "Add":
      return `${printExpr(expr.left)} + ${printExpr(expr.right)}`;
    case "Subtract":
      return `${printExpr(expr.left)} - ${printExpr(expr.right)}`;
    case "Multiply":
      return `${printExpr(expr.left)} * ${printExpr(expr.right)}`;
    case "Divide":
      return `${printExpr(expr.left)} / ${printExpr(expr.right)}`;
    case "LogicalAnd":
      return `${printExpr(expr.left)} and ${printExpr(expr.right)}`;
    case "LogicalOr":
      return `${printExpr(expr.left)} or ${printExpr(expr.right)}`;
    case "LessThan":
      return `${printExpr(expr.left)} < ${printExpr(expr.right)}`;
    case "LessThanOrEqual":
      return `${printExpr(expr.left)} <= ${printExpr(expr.right)}`;
    case "GreaterThan":
      return `${printExpr(expr.left)} > ${printExpr(expr.right)}`;
    case "GreaterThanOrEqual":
      return `${printExpr(expr.left)} >= ${printExpr(expr.right)}`;
    case "Equal":
      return `${printExpr(expr.left)} == ${printExpr(expr.right)}`;
    case "NotEqual":
      return `${printExpr(expr.left)} != ${printExpr(expr.right)}`;
    case "Sequence":
      return `${printExpr(expr.expr1)}; ${printExpr(expr.expr2)}`;
    case "Assignment":
      return `${printExpr(expr.lhs)} := ${printExpr(expr.rhs)}`;
    case "Reference":
      return `new (${printExpr(expr.expr)})`;
    case "Dereference":
      return `*${printExpr(expr.expr)}`;
    case "Panic":
      return "panic!";
    case "Throw":
      return `throw (${printExpr(expr.expr)})`;
    case "TryCatch":
      return `try { ${printExpr(expr.tryExpr)} } catch { ${printPattern(expr.pattern)} => ${printExpr(expr.fallbackExpr)} }`;
    case "TryWith":
      return `try { ${printExpr(expr.tryExpr)} } with { ${printExpr(expr.fallbackExpr)} }`;
    case "TryCastAs":
      return `try { ${printExpr(expr.tryExpr)} } cast as ${printType(expr.castType)} { ${printPattern(expr.pattern)} => ${printExpr(expr.successExpr)} } with { ${printExpr(expr.fallbackExpr)} }`;
    case "Fold":
      return `fold[${printType(expr.foldedType)}] (${printExpr(expr.expr)})`;
    case "Unfold":
      return `unfold[${printType(expr.unfoldedType)}] (${printExpr(expr.expr)})`;
    case "TypeApplication": {
      const types = expr.typeArguments.map(printType).join(", ");
      return `${printExpr(expr.function)}[${types}]`;
    }
    case "TypeAbstraction": {
      const params = expr.typeParams.join(", ");
      return `generic [${params}] ${printExpr(expr.expr)}`;
    }
    case "TypeCast":
      return `${printExpr(expr.expr)} cast as ${printType(expr.castType)}`;
  }
}

export function printPattern(pattern: Pattern): string {
  switch (pattern.type) {
    case "PatternVar":
      return pattern.name;
    case "PatternTrue":
      return "true";
    case "PatternFalse":
      return "false";
    case "PatternUnit":
      return "unit";
    case "PatternInt":
      return String(pattern.value);
    case "PatternSucc":
      return `succ(${printPattern(pattern.value)})`;
    case "PatternInl":
      return `inl(${printPattern(pattern.pattern)})`;
    case "PatternInr":
      return `inr(${printPattern(pattern.pattern)})`;
    case "PatternTuple": {
      const patterns = pattern.patterns.map(printPattern).join(", ");
      return `{${patterns}}`;
    }
    case "PatternRecord": {
      const patterns = pattern.patterns
        .map((p) => `${p.label} = ${printPattern(p.pattern)}`)
        .join(", ");
      return `{${patterns}}`;
    }
    case "PatternList": {
      const patterns = pattern.patterns.map(printPattern).join(", ");
      return `[${patterns}]`;
    }
    case "PatternCons":
      return `cons(${printPattern(pattern.head)}, ${printPattern(pattern.tail)})`;
    case "PatternVariant":
      return pattern.pattern
        ? `<| ${pattern.label} = ${printPattern(pattern.pattern)} |>`
        : `<| ${pattern.label} |>`;
    case "PatternAsc":
      return `${printPattern(pattern.pattern)} as ${printType(pattern.ascribedType)}`;
    case "PatternCastAs":
      return `${printPattern(pattern.pattern)} cast as ${printType(pattern.castType)}`;
    case "LabelledPattern":
      return `${pattern.label} = ${printPattern(pattern.pattern)}`;
  }
}
