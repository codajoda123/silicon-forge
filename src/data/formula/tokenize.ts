import { FormulaError } from "./errors";

export type Operator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||"
  | "!"
  | "("
  | ")"
  | ","
  | "?"
  | ":";

export type Token =
  | { kind: "number"; value: number; position: number }
  | { kind: "string"; value: string; position: number }
  | { kind: "identifier"; value: string; position: number }
  | { kind: "operator"; value: Operator; position: number }
  | { kind: "eof"; position: number };

export const MAX_EXPRESSION_LENGTH = 2048;

const TWO_CHARACTER_OPERATORS: readonly Operator[] = ["<=", ">=", "==", "!=", "&&", "||"];
const ONE_CHARACTER_OPERATORS: readonly Operator[] = [
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "<",
  ">",
  "!",
  "(",
  ")",
  ",",
  "?",
  ":",
];

const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/;

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function readString(expression: string, start: number): readonly [value: string, next: number] {
  const quote = expression[start];
  let value = "";
  let index = start + 1;
  while (index < expression.length) {
    const character = expression[index];
    if (character === quote) {
      return [value, index + 1];
    }
    if (character === "\\") {
      const escaped = expression[index + 1];
      if (escaped === undefined) {
        throw new FormulaError(`Unterminated string at position ${String(start)} in "${expression}"`);
      }
      const escapes: Readonly<Record<string, string>> = {
        "\\": "\\",
        "'": "'",
        '"': '"',
        n: "\n",
        t: "\t",
      };
      const replacement = escapes[escaped];
      if (replacement === undefined) {
        throw new FormulaError(
          `Unsupported escape "\\${escaped}" at position ${String(index)} in "${expression}"`,
        );
      }
      value += replacement;
      index += 2;
      continue;
    }
    if (character === "\n" || character === "\r") {
      throw new FormulaError(`Unterminated string at position ${String(start)} in "${expression}"`);
    }
    value += character;
    index += 1;
  }
  throw new FormulaError(`Unterminated string at position ${String(start)} in "${expression}"`);
}

/** Turn an expression into tokens. The evaluator never calls eval/new Function. */
export function tokenize(expression: string): Token[] {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaError(
      `Formula is longer than ${String(MAX_EXPRESSION_LENGTH)} characters: "${expression.slice(0, 40)}..."`,
    );
  }

  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];
    if (character === undefined) {
      break;
    }
    if (character === " " || character === "\t" || character === "\n" || character === "\r") {
      index += 1;
      continue;
    }

    if (isDigit(character) || (character === "." && isDigit(expression[index + 1]))) {
      const match = NUMBER_PATTERN.exec(expression.slice(index));
      if (match === null) {
        throw new FormulaError(`Invalid number at position ${String(index)} in "${expression}"`);
      }
      const value = Number(match[0]);
      if (!Number.isFinite(value)) {
        throw new FormulaError(`Number is not finite at position ${String(index)} in "${expression}"`);
      }
      tokens.push({ kind: "number", value, position: index });
      index += match[0].length;
      continue;
    }

    if (character === "'" || character === '"') {
      const [value, next] = readString(expression, index);
      tokens.push({ kind: "string", value, position: index });
      index = next;
      continue;
    }

    const identifierMatch = IDENTIFIER_PATTERN.exec(expression.slice(index));
    if (identifierMatch !== null) {
      tokens.push({ kind: "identifier", value: identifierMatch[0], position: index });
      index += identifierMatch[0].length;
      continue;
    }

    const twoCharacter = expression.slice(index, index + 2);
    const twoCharacterOperator = TWO_CHARACTER_OPERATORS.find((operator) => operator === twoCharacter);
    if (twoCharacterOperator !== undefined) {
      tokens.push({ kind: "operator", value: twoCharacterOperator, position: index });
      index += 2;
      continue;
    }

    const oneCharacterOperator = ONE_CHARACTER_OPERATORS.find((operator) => operator === character);
    if (oneCharacterOperator !== undefined) {
      tokens.push({ kind: "operator", value: oneCharacterOperator, position: index });
      index += 1;
      continue;
    }

    throw new FormulaError(
      `Unexpected character "${character}" at position ${String(index)} in "${expression}"`,
    );
  }

  tokens.push({ kind: "eof", position: expression.length });
  return tokens;
}
