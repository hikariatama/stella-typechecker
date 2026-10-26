import type {
  Abstraction,
  Add,
  Application,
  Assignment,
  Binding,
  Cons,
  ConstBool,
  ConstInt,
  ConstMemory,
  ConstUnit,
  Decl,
  DeclExceptionType,
  DeclExceptionVariant,
  DeclFun,
  DeclFunGeneric,
  DeclTypeAlias,
  Dereference,
  Divide,
  DotRecord,
  DotTuple,
  Equal,
  Expr,
  Extension,
  Fix,
  Fold,
  GreaterThan,
  GreaterThanOrEqual,
  If,
  Inl,
  Inr,
  LabelledPattern,
  LessThan,
  LessThanOrEqual,
  Let,
  LetRec,
  List,
  ListHead,
  ListIsEmpty,
  ListTail,
  LogicalAnd,
  LogicalNot,
  LogicalOr,
  Match,
  MatchCase,
  Multiply,
  NatIsZero,
  NatPred,
  NatRec,
  Node,
  NotEqual,
  Panic,
  ParamDecl,
  Pattern,
  PatternAsc,
  PatternBinding,
  PatternCastAs,
  PatternCons,
  PatternFalse,
  PatternInl,
  PatternInr,
  PatternInt,
  PatternList,
  PatternRecord,
  PatternSucc,
  PatternTrue,
  PatternTuple,
  PatternUnit,
  PatternVar,
  PatternVariant,
  Program,
  Record,
  RecordFieldType,
  Reference,
  Sequence,
  Subtract,
  Succ,
  Throw,
  TryCastAs,
  TryCatch,
  TryWith,
  Tuple,
  Type,
  TypeAbstraction,
  TypeApplication,
  TypeAscription,
  TypeAuto,
  TypeBool,
  TypeBottom,
  TypeCast,
  TypeForAll,
  TypeFun,
  TypeList,
  TypeNat,
  TypeRec,
  TypeRecord,
  TypeRef,
  TypeSum,
  TypeTop,
  TypeTuple,
  TypeUnit,
  TypeVar,
  TypeVariant,
  Unfold,
  Var,
  Variant,
  VariantFieldType,
} from "./ast";
import {
  AbstractionContext,
  AddContext,
  ApplicationContext,
  AssignContext,
  BindingContext,
  ConsListContext,
  ConstFalseContext,
  ConstIntContext,
  ConstMemoryContext,
  ConstTrueContext,
  ConstUnitContext,
  DeclContext,
  DeclExceptionTypeContext,
  DeclExceptionVariantContext,
  DeclFunContext,
  DeclFunGenericContext,
  DeclTypeAliasContext,
  DerefContext,
  DivideContext,
  DotRecordContext,
  DotTupleContext,
  EqualContext,
  ExprContext,
  ExtensionContext,
  FixContext,
  FoldContext,
  GreaterThanContext,
  GreaterThanOrEqualContext,
  HeadContext,
  IfContext,
  InlContext,
  InrContext,
  IsEmptyContext,
  IsZeroContext,
  LabelledPatternContext,
  LessThanContext,
  LessThanOrEqualContext,
  LetContext,
  LetRecContext,
  ListContext,
  LogicAndContext,
  LogicNotContext,
  LogicOrContext,
  MatchCaseContext,
  MatchContext,
  MultiplyContext,
  NatRecContext,
  NotEqualContext,
  PanicContext,
  ParamDeclContext,
  ParenthesisedExprContext,
  ParenthesisedPatternContext,
  PatternAscContext,
  PatternBindingContext,
  PatternCastAsContext,
  PatternConsContext,
  PatternContext,
  PatternFalseContext,
  PatternInlContext,
  PatternInrContext,
  PatternIntContext,
  PatternListContext,
  PatternRecordContext,
  PatternSuccContext,
  PatternTrueContext,
  PatternTupleContext,
  PatternUnitContext,
  PatternVarContext,
  PatternVariantContext,
  PredContext,
  ProgramContext,
  RecordContext,
  RecordFieldTypeContext,
  RefContext,
  SequenceContext,
  StellatypeContext,
  SubtractContext,
  SuccContext,
  TailContext,
  TerminatingSemicolonContext,
  ThrowContext,
  TryCastAsContext,
  TryCatchContext,
  TryWithContext,
  TupleContext,
  TypeAbstractionContext,
  TypeApplicationContext,
  TypeAscContext,
  TypeAutoContext,
  TypeBoolContext,
  TypeBottomContext,
  TypeCastContext,
  TypeForAllContext,
  TypeFunContext,
  TypeListContext,
  TypeNatContext,
  TypeParensContext,
  TypeRecContext,
  TypeRecordContext,
  TypeRefContext,
  TypeSumContext,
  TypeTopContext,
  TypeTupleContext,
  TypeUnitContext,
  TypeVarContext,
  TypeVariantContext,
  UnfoldContext,
  VarContext,
  VariantContext,
  VariantFieldTypeContext,
  type AnExtensionContext,
} from "./stella/stellaParser";
import StellaVisitor from "./stella/stellaParserVisitor";
import { withSourceContext } from "./source-context";

export class AstPrinter extends StellaVisitor<void> {
  private depth = 0;
  private print(msg: string) {
    console.log("|".repeat(this.depth) + "> " + msg);
  }

  visitProgram = (ctx: ProgramContext) => {
    this.depth++;

    this.print("Program");
    ctx.extension_list().forEach(this.visitAnExtension);
    ctx.decl_list().forEach(this.visitDecl);

    this.depth--;
  };

  visitAnExtension = (ext: ExtensionContext) => {
    const extension = ext as AnExtensionContext;
    this.depth++;

    extension.ExtensionName_list().forEach((name) => {
      this.print(`Extension [${name.getText()}]`);
    });

    this.depth--;
  };

  visitDecl = (ctx: DeclContext) => {
    if (ctx instanceof DeclFunContext) {
      return ctx.accept(this);
    }
    if (ctx instanceof DeclTypeAliasContext) {
      return ctx.accept(this);
    } else {
      this.print("Declaration");
    }
  };

  visitDeclFun = (ctx: DeclFunContext) => {
    this.depth++;

    this.print(`FunctionDecl [${ctx.StellaIdent().getText()}]`);

    // TODO: visit the children

    this.depth--;
  };

  visitDeclTypeAlias = (ctx: DeclTypeAliasContext) => {
    this.depth++;

    this.print("Type Alias");

    this.depth--;
  };
}

/**
 * This visitor transforms the concrete syntax tree generated by ANTLR into a simplified AST.
 * It does not follow the correct symantics of visitors (e.g.: uses `this.visit(node)`
 *  rather than `node.accept(this)`), but this is to avoid a lot of typecasting.
 */
export class AstTransformer extends StellaVisitor<Node> {
  private withSourceLocation<T extends object>(
    node: T,
    ctx: { start?: { line: number; column: number } | null }
  ): T {
    return withSourceContext(node, ctx);
  }

  visitProgram: (ctx: ProgramContext) => Program = (ctx) => {
    return this.withSourceLocation(
      {
        type: "Program",
        extensions: ctx
          .extension_list()
          .flatMap((ext) =>
            (ext as AnExtensionContext)
              .ExtensionName_list()
              .map((name) => name.getText() as Extension)
          ),
        declarations: ctx.decl_list().map(this.visitDecl),
      },
      ctx
    );
  };

  visitDecl: (ctx: DeclContext) => Decl = (ctx: DeclContext) => {
    if (ctx instanceof DeclFunContext) {
      return this.withSourceLocation(this.visitDeclFun(ctx), ctx);
    }
    if (ctx instanceof DeclFunGenericContext) {
      return this.withSourceLocation(this.visitDeclFunGeneric(ctx), ctx);
    }
    if (ctx instanceof DeclTypeAliasContext) {
      return this.withSourceLocation(this.visitDeclTypeAlias(ctx), ctx);
    }
    if (ctx instanceof DeclExceptionTypeContext) {
      return this.withSourceLocation(this.visitDeclExceptionType(ctx), ctx);
    }
    if (ctx instanceof DeclExceptionVariantContext) {
      return this.withSourceLocation(this.visitDeclExceptionVariant(ctx), ctx);
    }
    throw Error("Unknown declaration type: " + ctx.getText());
  };

  visitDeclFun: (ctx: DeclFunContext) => DeclFun = (ctx) => {
    return {
      type: "DeclFun",
      name: ctx._name.text,
      annotations: ctx._annotations.map((a) => a.getText()),
      nestedDeclarations: ctx.decl_list().map(this.visitDecl),
      parameters: ctx.paramDecl_list().map(this.visitParamDecl),
      returnType: ctx._returnType && this.visitType(ctx._returnType),
      throwTypes: ctx._throwTypes.map(this.visitType),
      returnValue: this.visitExpr(ctx._returnExpr),
    };
  };
  visitDeclFunGeneric: (ctx: DeclFunGenericContext) => DeclFunGeneric = (ctx) => {
    return {
      type: "DeclFunGeneric",
      name: ctx._name.text,
      annotations: ctx._annotations.map((a) => a.getText()),
      typeParams: ctx._generics.map((t) => t.text),
      parameters: ctx.paramDecl_list().map(this.visitParamDecl),
      returnType: ctx._returnType && this.visitType(ctx._returnType),
      throwTypes: ctx._throwTypes.map(this.visitType),
      nestedDeclarations: ctx.decl_list().map(this.visitDecl),
      returnValue: this.visitExpr(ctx._returnExpr),
    };
  };

  visitDeclTypeAlias: (ctx: DeclTypeAliasContext) => DeclTypeAlias = (ctx) => {
    return {
      type: "DeclTypeAlias",
      alias: ctx._name.text,
      aliasedType: this.visitType(ctx._atype),
    };
  };

  visitDeclExceptionType: (ctx: DeclExceptionTypeContext) => DeclExceptionType = (ctx) => {
    return {
      type: "DeclExceptionType",
      exceptionType: this.visitType(ctx._exceptionType),
    };
  };
  visitDeclExceptionVariant: (ctx: DeclExceptionVariantContext) => DeclExceptionVariant = (ctx) => {
    return {
      type: "DeclExceptionVariant",
      name: ctx._name.text,
      variantType: this.visitType(ctx._variantType),
    };
  };

  visitExpr: (ctx: ExprContext) => Expr = (ctx) => {
    if (ctx instanceof DotRecordContext) {
      return this.withSourceLocation(this.visitDotRecord(ctx), ctx);
    }
    if (ctx instanceof DotTupleContext) {
      return this.withSourceLocation(this.visitDotTuple(ctx), ctx);
    }
    if (ctx instanceof ConstTrueContext) {
      return this.withSourceLocation(this.visitConstTrue(ctx), ctx);
    }
    if (ctx instanceof ConstFalseContext) {
      return this.withSourceLocation(this.visitConstFalse(ctx), ctx);
    }
    if (ctx instanceof ConstUnitContext) {
      return this.withSourceLocation(this.visitConstUnit(ctx), ctx);
    }
    if (ctx instanceof ConstIntContext) {
      return this.withSourceLocation(this.visitConstInt(ctx), ctx);
    }
    if (ctx instanceof ConstMemoryContext) {
      return this.withSourceLocation(this.visitConstMemory(ctx), ctx);
    }
    if (ctx instanceof VarContext) {
      return this.withSourceLocation(this.visitVar(ctx), ctx);
    }
    if (ctx instanceof InlContext) {
      return this.withSourceLocation(this.visitInl(ctx), ctx);
    }
    if (ctx instanceof InrContext) {
      return this.withSourceLocation(this.visitInr(ctx), ctx);
    }
    if (ctx instanceof ConsListContext) {
      return this.withSourceLocation(this.visitConsList(ctx), ctx);
    }
    if (ctx instanceof HeadContext) {
      return this.withSourceLocation(this.visitHead(ctx), ctx);
    }
    if (ctx instanceof IsEmptyContext) {
      return this.withSourceLocation(this.visitIsEmpty(ctx), ctx);
    }
    if (ctx instanceof TailContext) {
      return this.withSourceLocation(this.visitTail(ctx), ctx);
    }
    if (ctx instanceof SuccContext) {
      return this.withSourceLocation(this.visitSucc(ctx), ctx);
    }
    if (ctx instanceof LogicNotContext) {
      return this.withSourceLocation(this.visitLogicNot(ctx), ctx);
    }
    if (ctx instanceof PredContext) {
      return this.withSourceLocation(this.visitPred(ctx), ctx);
    }
    if (ctx instanceof IsZeroContext) {
      return this.withSourceLocation(this.visitIsZero(ctx), ctx);
    }
    if (ctx instanceof FixContext) {
      return this.withSourceLocation(this.visitFix(ctx), ctx);
    }
    if (ctx instanceof NatRecContext) {
      return this.withSourceLocation(this.visitNatRec(ctx), ctx);
    }
    if (ctx instanceof FoldContext) {
      return this.withSourceLocation(this.visitFold(ctx), ctx);
    }
    if (ctx instanceof UnfoldContext) {
      return this.withSourceLocation(this.visitUnfold(ctx), ctx);
    }
    if (ctx instanceof ApplicationContext) {
      return this.withSourceLocation(this.visitApplication(ctx), ctx);
    }
    if (ctx instanceof TypeApplicationContext) {
      return this.withSourceLocation(this.visitTypeApplication(ctx), ctx);
    }
    if (ctx instanceof MultiplyContext) {
      return this.withSourceLocation(this.visitMultiply(ctx), ctx);
    }
    if (ctx instanceof DivideContext) {
      return this.withSourceLocation(this.visitDivide(ctx), ctx);
    }
    if (ctx instanceof LogicAndContext) {
      return this.withSourceLocation(this.visitLogicAnd(ctx), ctx);
    }
    if (ctx instanceof AddContext) {
      return this.withSourceLocation(this.visitAdd(ctx), ctx);
    }
    if (ctx instanceof SubtractContext) {
      return this.withSourceLocation(this.visitSubtract(ctx), ctx);
    }
    if (ctx instanceof LogicOrContext) {
      return this.withSourceLocation(this.visitLogicOr(ctx), ctx);
    }
    if (ctx instanceof AbstractionContext) {
      return this.withSourceLocation(this.visitAbstraction(ctx), ctx);
    }
    if (ctx instanceof TypeAbstractionContext) {
      return this.withSourceLocation(this.visitTypeAbstraction(ctx), ctx);
    }
    if (ctx instanceof TypeAscContext) {
      return this.withSourceLocation(this.visitTypeAsc(ctx), ctx);
    }
    if (ctx instanceof TupleContext) {
      return this.withSourceLocation(this.visitTuple(ctx), ctx);
    }
    if (ctx instanceof RecordContext) {
      return this.withSourceLocation(this.visitRecord(ctx), ctx);
    }
    if (ctx instanceof VariantContext) {
      return this.withSourceLocation(this.visitVariant(ctx), ctx);
    }
    if (ctx instanceof MatchContext) {
      return this.withSourceLocation(this.visitMatch(ctx), ctx);
    }
    if (ctx instanceof ListContext) {
      return this.withSourceLocation(this.visitList(ctx), ctx);
    }
    if (ctx instanceof LessThanContext) {
      return this.withSourceLocation(this.visitLessThan(ctx), ctx);
    }
    if (ctx instanceof LessThanOrEqualContext) {
      return this.withSourceLocation(this.visitLessThanOrEqual(ctx), ctx);
    }
    if (ctx instanceof GreaterThanContext) {
      return this.withSourceLocation(this.visitGreaterThan(ctx), ctx);
    }
    if (ctx instanceof GreaterThanOrEqualContext) {
      return this.withSourceLocation(this.visitGreaterThanOrEqual(ctx), ctx);
    }
    if (ctx instanceof EqualContext) {
      return this.withSourceLocation(this.visitEqual(ctx), ctx);
    }
    if (ctx instanceof NotEqualContext) {
      return this.withSourceLocation(this.visitNotEqual(ctx), ctx);
    }
    if (ctx instanceof IfContext) {
      return this.withSourceLocation(this.visitIf(ctx), ctx);
    }
    if (ctx instanceof LetContext) {
      return this.withSourceLocation(this.visitLet(ctx), ctx);
    }
    if (ctx instanceof LetRecContext) {
      return this.withSourceLocation(this.visitLetRec(ctx), ctx);
    }
    if (ctx instanceof ParenthesisedExprContext) {
      return this.withSourceLocation(this.visitParenthesisedExpr(ctx), ctx);
    }
    if (ctx instanceof SequenceContext) {
      return this.withSourceLocation(this.visitSequence(ctx), ctx);
    }
    if (ctx instanceof TerminatingSemicolonContext) {
      return this.withSourceLocation(this.visitTerminatingSemicolon(ctx), ctx);
    }
    if (ctx instanceof AssignContext) {
      return this.withSourceLocation(this.visitAssign(ctx), ctx);
    }
    if (ctx instanceof TypeCastContext) {
      return this.withSourceLocation(this.visitTypeCast(ctx), ctx);
    }
    if (ctx instanceof RefContext) {
      return this.withSourceLocation(this.visitRef(ctx), ctx);
    }
    if (ctx instanceof DerefContext) {
      return this.withSourceLocation(this.visitDeref(ctx), ctx);
    }
    if (ctx instanceof PanicContext) {
      return this.withSourceLocation(this.visitPanic(ctx), ctx);
    }
    if (ctx instanceof ThrowContext) {
      return this.withSourceLocation(this.visitThrow(ctx), ctx);
    }
    if (ctx instanceof TryCatchContext) {
      return this.withSourceLocation(this.visitTryCatch(ctx), ctx);
    }
    if (ctx instanceof TryWithContext) {
      return this.withSourceLocation(this.visitTryWith(ctx), ctx);
    }
    if (ctx instanceof TryCastAsContext) {
      return this.withSourceLocation(this.visitTryCastAs(ctx), ctx);
    }

    throw new Error("Unknown expression type: " + ctx.getText());
  };

  visitDotRecord: (ctx: DotRecordContext) => DotRecord = (ctx) => {
    return {
      type: "DotRecord",
      label: ctx._label.text,
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitDotTuple: (ctx: DotTupleContext) => DotTuple = (ctx) => {
    return {
      type: "DotTuple",
      index: Number(ctx._index.text),
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitConstUnit: (ctx: ConstUnitContext) => ConstUnit = (ctx) => {
    return { type: "Unit" };
  };

  visitVar: (ctx: VarContext) => Var = (ctx) => {
    return {
      type: "Var",
      name: ctx._name.text,
    };
  };
  visitInl: (ctx: InlContext) => Inl = (ctx) => {
    return {
      type: "Inl",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitInr: (ctx: InrContext) => Inr = (ctx) => {
    return {
      type: "Inr",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitConsList: (ctx: ConsListContext) => Cons = (ctx) => {
    return {
      type: "Cons",
      head: this.visitExpr(ctx._head),
      tail: this.visitExpr(ctx._tail),
    };
  };
  visitHead: (ctx: HeadContext) => ListHead = (ctx) => {
    return {
      type: "ListHead",
      expr: this.visitExpr(ctx._list),
    };
  };
  visitIsEmpty: (ctx: IsEmptyContext) => ListIsEmpty = (ctx) => {
    return {
      type: "ListIsEmpty",
      expr: this.visitExpr(ctx._list),
    };
  };
  visitTail: (ctx: TailContext) => ListTail = (ctx) => {
    return {
      type: "ListTail",
      expr: this.visitExpr(ctx._list),
    };
  };
  visitLogicNot: (ctx: LogicNotContext) => LogicalNot = (ctx) => {
    return {
      type: "LogicalNot",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitPred: (ctx: PredContext) => NatPred = (ctx) => {
    return {
      type: "NatPred",
      expr: this.visitExpr(ctx._n),
    };
  };
  visitIsZero: (ctx: IsZeroContext) => NatIsZero = (ctx) => {
    return {
      type: "NatIsZero",
      expr: this.visitExpr(ctx._n),
    };
  };
  visitFix: (ctx: FixContext) => Fix = (ctx) => {
    return {
      type: "Fix",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitNatRec: (ctx: NatRecContext) => NatRec = (ctx) => {
    return {
      type: "NatRec",
      initial: this.visitExpr(ctx._initial),
      n: this.visitExpr(ctx._n),
      step: this.visitExpr(ctx._step),
    };
  };
  visitFold: (ctx: FoldContext) => Fold = (ctx) => {
    return {
      type: "Fold",
      expr: this.visitExpr(ctx._expr_),
      foldedType: this.visitType(ctx._type_),
    };
  };
  visitUnfold: (ctx: UnfoldContext) => Unfold = (ctx) => {
    return {
      type: "Unfold",
      expr: this.visitExpr(ctx._expr_),
      unfoldedType: this.visitType(ctx._type_),
    };
  };
  visitMultiply: (ctx: MultiplyContext) => Multiply = (ctx) => {
    return {
      type: "Multiply",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitDivide: (ctx: DivideContext) => Divide = (ctx) => {
    return {
      type: "Divide",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitLogicAnd: (ctx: LogicAndContext) => LogicalAnd = (ctx) => {
    return {
      type: "LogicalAnd",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitAdd: (ctx: AddContext) => Add = (ctx) => {
    return {
      type: "Add",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitSubtract: (ctx: SubtractContext) => Subtract = (ctx) => {
    return {
      type: "Subtract",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitLogicOr: (ctx: LogicOrContext) => LogicalOr = (ctx) => {
    return {
      type: "LogicalOr",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitAbstraction: (ctx: AbstractionContext) => Abstraction = (ctx) => {
    return {
      type: "Abstraction",
      parameters: ctx._paramDecls.map(this.visitParamDecl),
      returnValue: this.visitExpr(ctx._returnExpr),
    };
  };
  visitTypeAbstraction: (ctx: TypeAbstractionContext) => TypeAbstraction = (ctx) => {
    return {
      type: "TypeAbstraction",
      typeParams: ctx._generics.map((t) => t.text),
      expr: this.visitExpr(ctx._expr_),
    };
  };

  visitApplication: (ctx: ApplicationContext) => Application = (ctx) => {
    // Question: what is ctx._expr?
    return {
      type: "Application",
      function: this.visitExpr(ctx._fun),
      arguments: ctx._args.map(this.visitExpr),
    };
  };
  visitTypeApplication: (ctx: TypeApplicationContext) => TypeApplication = (ctx) => {
    return {
      type: "TypeApplication",
      function: this.visitExpr(ctx._fun),
      typeArguments: ctx._types.map(this.visitType),
    };
  };

  visitSucc: (ctx: SuccContext) => Succ = (ctx) => {
    return {
      type: "Succ",
      expr: this.visitExpr(ctx._n),
    };
  };

  visitConstInt: (ctx: ConstIntContext) => ConstInt = (ctx) => {
    return {
      type: "ConstInt",
      value: Number(ctx._n.text),
    };
  };
  visitConstTrue: (ctx: ConstTrueContext) => ConstBool = (ctx) => {
    return {
      type: "ConstBool",
      value: true,
    };
  };
  visitConstFalse: (ctx: ConstFalseContext) => ConstBool = (ctx) => {
    return {
      type: "ConstBool",
      value: false,
    };
  };

  visitConstMemory: (ctx: ConstMemoryContext) => ConstMemory = (ctx) => {
    return {
      type: "ConstMemory",
      value: ctx._mem.text,
    };
  };

  visitAssign: (ctx: AssignContext) => Assignment = (ctx) => {
    return {
      type: "Assignment",
      lhs: this.visitExpr(ctx._lhs),
      rhs: this.visitExpr(ctx._rhs),
    };
  };
  visitTypeCast: (ctx: TypeCastContext) => TypeCast = (ctx) => {
    return {
      type: "TypeCast",
      castType: this.visitType(ctx._type_),
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitRef: (ctx: RefContext) => Reference = (ctx) => {
    return {
      type: "Reference",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitDeref: (ctx: DerefContext) => Dereference = (ctx) => {
    return {
      type: "Dereference",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitPanic: (ctx: PanicContext) => Panic = (ctx) => {
    return {
      type: "Panic",
    };
  };
  visitThrow: (ctx: ThrowContext) => Throw = (ctx) => {
    return {
      type: "Throw",
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitTryCatch: (ctx: TryCatchContext) => TryCatch = (ctx) => {
    return {
      type: "TryCatch",
      tryExpr: this.visitExpr(ctx._tryExpr),
      pattern: this.visitPattern(ctx._pat),
      fallbackExpr: this.visitExpr(ctx._fallbackExpr),
    };
  };
  visitTryWith: (ctx: TryWithContext) => TryWith = (ctx) => {
    return {
      type: "TryWith",
      tryExpr: this.visitExpr(ctx._tryExpr),
      fallbackExpr: this.visitExpr(ctx._fallbackExpr),
    };
  };
  visitTryCastAs: (ctx: TryCastAsContext) => TryCastAs = (ctx) => {
    return {
      type: "TryCastAs",
      tryExpr: this.visitExpr(ctx._tryExpr),
      castType: this.visitType(ctx._type_),
      pattern: this.visitPattern(ctx._pattern_),
      successExpr: this.visitExpr(ctx._expr_),
      fallbackExpr: this.visitExpr(ctx._fallbackExpr),
    };
  };

  visitParamDecl: (ctx: ParamDeclContext) => ParamDecl = (ctx) => {
    return this.withSourceLocation(
      {
        type: "ParamDecl",
        name: ctx._name.text,
        paramType: this.visitType(ctx._paramType),
      },
      ctx
    );
  };

  visitType: (ctx: StellatypeContext) => Type = (ctx) => {
    if (ctx instanceof TypeAutoContext) {
      return this.withSourceLocation(this.visitTypeAuto(ctx), ctx);
    }
    if (ctx instanceof TypeNatContext) {
      return this.withSourceLocation(this.visitTypeNat(ctx), ctx);
    }
    if (ctx instanceof TypeBoolContext) {
      return this.withSourceLocation(this.visitTypeBool(ctx), ctx);
    }
    if (ctx instanceof TypeUnitContext) {
      return this.withSourceLocation(this.visitTypeUnit(ctx), ctx);
    }
    if (ctx instanceof TypeTopContext) {
      return this.withSourceLocation(this.visitTypeTop(ctx), ctx);
    }
    if (ctx instanceof TypeBottomContext) {
      return this.withSourceLocation(this.visitTypeBottom(ctx), ctx);
    }
    if (ctx instanceof TypeFunContext) {
      return this.withSourceLocation(this.visitTypeFun(ctx), ctx);
    }
    if (ctx instanceof TypeRecContext) {
      return this.withSourceLocation(this.visitTypeRec(ctx), ctx);
    }
    if (ctx instanceof TypeSumContext) {
      return this.withSourceLocation(this.visitTypeSum(ctx), ctx);
    }
    if (ctx instanceof TypeTupleContext) {
      return this.withSourceLocation(this.visitTypeTuple(ctx), ctx);
    }
    if (ctx instanceof RecordFieldTypeContext) {
      return this.withSourceLocation(this.visitRecordFieldType(ctx), ctx);
    }
    if (ctx instanceof TypeRecordContext) {
      return this.withSourceLocation(this.visitTypeRecord(ctx), ctx);
    }
    if (ctx instanceof VariantFieldTypeContext) {
      return this.withSourceLocation(this.visitVariantFieldType(ctx), ctx);
    }
    if (ctx instanceof TypeVariantContext) {
      return this.withSourceLocation(this.visitTypeVariant(ctx), ctx);
    }
    if (ctx instanceof TypeListContext) {
      return this.withSourceLocation(this.visitTypeList(ctx), ctx);
    }
    if (ctx instanceof TypeVarContext) {
      return this.withSourceLocation(this.visitTypeVar(ctx), ctx);
    }
    if (ctx instanceof TypeParensContext) {
      return this.withSourceLocation(this.visitTypeParens(ctx), ctx);
    }
    if (ctx instanceof TypeRefContext) {
      return this.withSourceLocation(this.visitTypeRef(ctx), ctx);
    }
    if (ctx instanceof TypeForAllContext) {
      return this.withSourceLocation(this.visitTypeForAll(ctx), ctx);
    }
    throw new Error("Unknown type: " + ctx.getText());
  };

  visitTypeAuto = (ctx: TypeAutoContext) => ({ type: "TypeAuto" }) as TypeAuto;
  visitTypeNat = (ctx: TypeNatContext) => ({ type: "TypeNat" }) as TypeNat;
  visitTypeBool = (ctx: TypeBoolContext) => ({ type: "TypeBool" }) as TypeBool;
  visitTypeTop: (ctx: TypeTopContext) => TypeTop = (ctx) => {
    return {
      type: "TypeTop",
    };
  };
  visitTypeBottom: (ctx: TypeBottomContext) => TypeBottom = (ctx) => {
    return {
      type: "TypeBottom",
    };
  };

  visitTypeFun: (ctx: TypeFunContext) => TypeFun = (ctx) => {
    return {
      type: "TypeFun",
      parametersTypes: ctx._paramTypes.map(this.visitType),
      returnType: this.visitType(ctx._returnType),
    };
  };
  visitTypeRec: (ctx: TypeRecContext) => TypeRec = (ctx) => {
    return {
      type: "TypeRec",
      var: ctx._var_.text,
      recType: this.visitType(ctx._type_),
    };
  };
  visitTypeSum: (ctx: TypeSumContext) => TypeSum = (ctx) => {
    return {
      type: "TypeSum",
      left: this.visitType(ctx._left),
      right: this.visitType(ctx._right),
    };
  };
  visitTypeTuple: (ctx: TypeTupleContext) => TypeTuple = (ctx) => {
    return {
      type: "TypeTuple",
      types: ctx._types.map(this.visitType),
    };
  };
  visitRecordFieldType: (ctx: RecordFieldTypeContext) => RecordFieldType = (ctx) => {
    return {
      type: "RecordFieldType",
      label: ctx._label.text,
      fieldType: this.visitType(ctx._type_),
    };
  };
  visitTypeRecord: (ctx: TypeRecordContext) => TypeRecord = (ctx) => {
    return {
      type: "TypeRecord",
      fieldTypes: ctx._fieldTypes.map(this.visitRecordFieldType),
    };
  };
  visitVariantFieldType: (ctx: VariantFieldTypeContext) => VariantFieldType = (ctx) => {
    return {
      type: "VariantFieldType",
      label: ctx._label.text,
      fieldType: ctx._type_ !== undefined ? this.visitType(ctx._type_) : undefined,
    };
  };
  visitTypeVariant: (ctx: TypeVariantContext) => TypeVariant = (ctx) => {
    return {
      type: "TypeVariant",
      fieldTypes: ctx._fieldTypes.map(this.visitVariantFieldType),
    };
  };
  visitTypeList: (ctx: TypeListContext) => TypeList = (ctx) => {
    return {
      type: "TypeList",
      elementType: this.visitType(ctx._type_),
    };
  };
  visitTypeUnit: (ctx: TypeUnitContext) => TypeUnit = (ctx) => {
    return {
      type: "TypeUnit",
    };
  };
  visitTypeVar: (ctx: TypeVarContext) => TypeVar = (ctx) => {
    return {
      type: "TypeVar",
      name: ctx._name.text,
    };
  };
  visitTypeParens: (ctx: TypeParensContext) => Type = (ctx) => {
    return this.visitType(ctx._type_);
  };
  visitTypeRef: (ctx: TypeRefContext) => TypeRef = (ctx) => {
    return {
      type: "TypeRef",
      referredType: this.visitType(ctx._type_),
    };
  };
  visitTypeForAll: (ctx: TypeForAllContext) => TypeForAll = (ctx) => {
    return {
      type: "TypeForAll",
      typeVars: ctx._types.map((t) => t.text),
      body: this.visitType(ctx._type_),
    };
  };

  visitTypeAsc: (ctx: TypeAscContext) => TypeAscription = (ctx) => {
    return {
      type: "TypeAscription",
      expr: this.visitExpr(ctx._expr_),
      ascribedType: this.visitType(ctx._type_),
    };
  };

  visitTuple: (ctx: TupleContext) => Tuple = (ctx) => {
    return {
      type: "Tuple",
      exprs: ctx._exprs.map(this.visitExpr),
    };
  };
  visitRecord: (ctx: RecordContext) => Record = (ctx) => {
    return {
      type: "Record",
      bindings: ctx._bindings.map(this.visitBinding),
    };
  };
  visitVariant: (ctx: VariantContext) => Variant = (ctx) => {
    return {
      type: "Variant",
      label: ctx._label.text,
      expr: ctx._rhs && this.visitExpr(ctx._rhs),
    };
  };
  visitMatch: (ctx: MatchContext) => Match = (ctx) => {
    return {
      type: "Match",
      cases: ctx._cases.map(this.visitMatchCase),
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitMatchCase: (ctx: MatchCaseContext) => MatchCase = (ctx) => {
    return {
      type: "MatchCase",
      pattern: this.visitPattern(ctx._pattern_),
      expr: this.visitExpr(ctx._expr_),
    };
  };
  visitList: (ctx: ListContext) => List = (ctx) => {
    return {
      type: "List",
      exprs: ctx._exprs.map(this.visitExpr),
    };
  };
  visitLessThan: (ctx: LessThanContext) => LessThan = (ctx) => {
    return {
      type: "LessThan",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitLessThanOrEqual: (ctx: LessThanOrEqualContext) => LessThanOrEqual = (ctx) => {
    return {
      type: "LessThanOrEqual",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitGreaterThan: (ctx: GreaterThanContext) => GreaterThan = (ctx) => {
    return {
      type: "GreaterThan",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitGreaterThanOrEqual: (ctx: GreaterThanOrEqualContext) => GreaterThanOrEqual = (ctx) => {
    return {
      type: "GreaterThanOrEqual",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitEqual: (ctx: EqualContext) => Equal = (ctx) => {
    return {
      type: "Equal",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitNotEqual: (ctx: NotEqualContext) => NotEqual = (ctx) => {
    return {
      type: "NotEqual",
      left: this.visitExpr(ctx._left),
      right: this.visitExpr(ctx._right),
    };
  };
  visitIf: (ctx: IfContext) => If = (ctx) => {
    return {
      type: "If",
      condition: this.visitExpr(ctx._condition),
      thenExpr: this.visitExpr(ctx._thenExpr),
      elseExpr: this.visitExpr(ctx._elseExpr),
    };
  };
  visitLet: (ctx: LetContext) => Let = (ctx) => {
    return {
      type: "Let",
      patternBindings: ctx._patternBindings.map(this.visitPatternBinding),
      body: this.visitExpr(ctx._body),
    };
  };
  visitLetRec: (ctx: LetRecContext) => LetRec = (ctx) => {
    return {
      type: "LetRec",
      patternBindings: ctx._patternBindings.map(this.visitPatternBinding),
      body: this.visitExpr(ctx._body),
    };
  };
  visitPatternBinding: (ctx: PatternBindingContext) => PatternBinding = (ctx) => {
    return {
      type: "PatternBinding",
      pattern: this.visitPattern(ctx._pat),
      rhs: this.visitExpr(ctx._rhs),
    };
  };
  visitSequence: (ctx: SequenceContext) => Sequence = (ctx) => {
    return {
      type: "Sequence",
      expr1: this.visitExpr(ctx._expr1),
      expr2: this.visitExpr(ctx._expr2),
    };
  };
  visitTerminatingSemicolon: (ctx: TerminatingSemicolonContext) => Expr = (ctx) => {
    return this.visitExpr(ctx._expr_);
  };
  visitParenthesisedExpr: (ctx: ParenthesisedExprContext) => Expr = (ctx) => {
    return this.visitExpr(ctx._expr_);
  };

  visitBinding: (ctx: BindingContext) => Binding = (ctx) => {
    return {
      type: "Binding",
      name: ctx._name.text,
      expr: this.visitExpr(ctx._rhs),
    };
  };

  visitPattern: (ctx: PatternContext) => Pattern = (ctx) => {
    if (ctx instanceof PatternVariantContext) {
      return this.withSourceLocation(this.visitPatternVariant(ctx), ctx);
    }
    if (ctx instanceof PatternAscContext) {
      return this.withSourceLocation(this.visitPatternAsc(ctx), ctx);
    }
    if (ctx instanceof PatternCastAsContext) {
      return this.withSourceLocation(this.visitPatternCastAs(ctx), ctx);
    }
    if (ctx instanceof PatternInlContext) {
      return this.withSourceLocation(this.visitPatternInl(ctx), ctx);
    }
    if (ctx instanceof PatternInrContext) {
      return this.withSourceLocation(this.visitPatternInr(ctx), ctx);
    }
    if (ctx instanceof PatternTupleContext) {
      return this.withSourceLocation(this.visitPatternTuple(ctx), ctx);
    }
    if (ctx instanceof PatternRecordContext) {
      return this.withSourceLocation(this.visitPatternRecord(ctx), ctx);
    }
    if (ctx instanceof PatternListContext) {
      return this.withSourceLocation(this.visitPatternList(ctx), ctx);
    }
    if (ctx instanceof PatternConsContext) {
      return this.withSourceLocation(this.visitPatternCons(ctx), ctx);
    }
    if (ctx instanceof PatternFalseContext) {
      return this.withSourceLocation(this.visitPatternFalse(ctx), ctx);
    }
    if (ctx instanceof PatternTrueContext) {
      return this.withSourceLocation(this.visitPatternTrue(ctx), ctx);
    }
    if (ctx instanceof PatternUnitContext) {
      return this.withSourceLocation(this.visitPatternUnit(ctx), ctx);
    }
    if (ctx instanceof PatternIntContext) {
      return this.withSourceLocation(this.visitPatternInt(ctx), ctx);
    }
    if (ctx instanceof PatternSuccContext) {
      return this.withSourceLocation(this.visitPatternSucc(ctx), ctx);
    }
    if (ctx instanceof PatternVarContext) {
      return this.withSourceLocation(this.visitPatternVar(ctx), ctx);
    }
    if (ctx instanceof ParenthesisedPatternContext) {
      return this.withSourceLocation(this.visitParenthesisedPattern(ctx), ctx);
    }

    throw new Error("Unknown pattern type: " + ctx.getText());
  };

  visitPatternVariant: (ctx: PatternVariantContext) => PatternVariant = (ctx) => {
    return {
      type: "PatternVariant",
      label: ctx._label.text,
      pattern: ctx._pattern_ && this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternAsc: (ctx: PatternAscContext) => PatternAsc = (ctx) => {
    return {
      type: "PatternAsc",
      pattern: this.visitPattern(ctx._pattern_),
      ascribedType: this.visitType(ctx._type_),
    };
  };
  visitPatternCastAs: (ctx: PatternCastAsContext) => PatternCastAs = (ctx) => {
    return {
      type: "PatternCastAs",
      castType: this.visitType(ctx._type_),
      pattern: this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternInl: (ctx: PatternInlContext) => PatternInl = (ctx) => {
    return {
      type: "PatternInl",
      pattern: this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternInr: (ctx: PatternInrContext) => PatternInr = (ctx) => {
    return {
      type: "PatternInr",
      pattern: this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternTuple: (ctx: PatternTupleContext) => PatternTuple = (ctx) => {
    return {
      type: "PatternTuple",
      patterns: ctx.pattern_list().map(this.visitPattern),
    };
  };
  visitLabelledPattern: (ctx: LabelledPatternContext) => LabelledPattern = (ctx) => {
    return {
      type: "LabelledPattern",
      label: ctx._label.text,
      pattern: this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternRecord: (ctx: PatternRecordContext) => PatternRecord = (ctx) => {
    return {
      type: "PatternRecord",
      patterns: ctx.labelledPattern_list().map(this.visitLabelledPattern),
    };
  };
  visitPatternList: (ctx: PatternListContext) => PatternList = (ctx) => {
    return {
      type: "PatternList",
      patterns: ctx.pattern_list().map(this.visitPattern),
    };
  };
  visitPatternCons: (ctx: PatternConsContext) => PatternCons = (ctx) => {
    return {
      type: "PatternCons",
      head: this.visitPattern(ctx._head),
      tail: this.visitPattern(ctx._tail),
    };
  };
  visitPatternFalse: (ctx: PatternFalseContext) => PatternFalse = (ctx) => {
    return {
      type: "PatternFalse",
    };
  };
  visitPatternTrue: (ctx: PatternTrueContext) => PatternTrue = (ctx) => {
    return {
      type: "PatternTrue",
    };
  };
  visitPatternUnit: (ctx: PatternUnitContext) => PatternUnit = (ctx) => {
    return {
      type: "PatternUnit",
    };
  };
  visitPatternInt: (ctx: PatternIntContext) => PatternInt = (ctx) => {
    return {
      type: "PatternInt",
      value: Number(ctx._n.text),
    };
  };
  visitPatternSucc: (ctx: PatternSuccContext) => PatternSucc = (ctx) => {
    return {
      type: "PatternSucc",
      value: this.visitPattern(ctx._pattern_),
    };
  };
  visitPatternVar: (ctx: PatternVarContext) => PatternVar = (ctx) => {
    return {
      type: "PatternVar",
      name: ctx._name.text,
    };
  };
  visitParenthesisedPattern: (ctx: ParenthesisedPatternContext) => Pattern = (ctx) => {
    return this.visitPattern(ctx._pattern_);
  };
}
