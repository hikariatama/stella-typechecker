import { CharStreams, CommonTokenStream } from "antlr4";
import fs from "node:fs";
import { formatTypeCheckError, TypeCheckError } from "./errors";
import StellaLexer from "./stella/stellaLexer";
import StellaParser from "./stella/stellaParser";
import { typecheckProgram } from "./typechecker";
import { AstTransformer } from "./visitors";

function main(sourceCode: string): void {
  const inputStream = CharStreams.fromString(sourceCode);
  const lexer = new StellaLexer(inputStream);
  const syntaxErrors: string[] = [];
  lexer.removeErrorListeners();
  const parserErrorListener = {
    syntaxError: (
      _recognizer: unknown,
      _symbol: unknown,
      line: number,
      column: number,
      message: string
    ) => {
      syntaxErrors.push(
        `syntax error at line ${line}, column ${column + 1}${message ? ` before ${message.split(" expecting ")[0]}` : ""}`
      );
    },
    reportAmbiguity: () => {},
    reportAttemptingFullContext: () => {},
    reportContextSensitivity: () => {},
  };
  lexer.addErrorListener(parserErrorListener);
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new StellaParser(tokenStream);
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrorListener);
  const program = parser.program();
  if (syntaxErrors.length > 0) {
    throw new Error(syntaxErrors[0]);
  }
  const transformer = new AstTransformer();
  const ast = transformer.visitProgram(program);
  typecheckProgram(ast);
}

const sourceCode = fs.readFileSync(0, "utf-8");

try {
  main(sourceCode);
  process.exitCode = 0;
} catch (error: unknown) {
  const formattedError =
    error instanceof TypeCheckError
      ? formatTypeCheckError(error, sourceCode)
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${formattedError}\n`);
  process.exitCode = 1;
}
