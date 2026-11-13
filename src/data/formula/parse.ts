import { FormulaError } from "./errors";
import { tokenize, type Operator, type Token } from "./tokenize";

export type BinaryOperator =
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
  | "||";

export type UnaryOperator = "-" | "+" | "!";

export type Expression =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "unary"; readonly operator: UnaryOperator; readonly operand: Expression }
  | {
      readonly kind: "binary";
      readonly operator: BinaryOperator;
      readonly left: Expression;
      readonly right: Expression;
    }
  | {
      readonly kind: "ternary";
      readonly condition: Expression;
      readonly whenTrue: Expression;
      readonly whenFalse: Expression;
    }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly Expression[] };

const MAX_DEPTH = 256;

interface ParserState {
  readonly tokens: readonly Token[];
  readonly source: string;
  index: number;
  depth: number;
}

function current(state: ParserState): Token {
  const token = state.tokens[state.index];
  if (token === undefined) {
    return { kind: "eof", position: state.source.length };
  }
  return token;
}

function describe(token: Token): string {
  if (token.kind === "eof") {
    return "end of formula";
  }
  return `"${String(token.value)}"`;
}

function fail(state: ParserState, message: string): never {
  throw new FormulaError(`${message} at position ${String(current(state).position)} in "${state.source}"`);
}

function isOperator<O extends Operator>(
  token: Token,
  operator: O,
): token is { kind: "operator"; value: O; position: number } {
  return token.kind === "operator" && token.value === operator;
}

function enter(state: ParserState): void {
  state.depth += 1;
  if (state.depth > MAX_DEPTH) {
    throw new FormulaError(`Formula nesting is deeper than ${String(MAX_DEPTH)} levels in "${state.source}"`);
  }
}

function exit(state: ParserState): void {
  state.depth -= 1;
}

function consumeOperator(state: ParserState, operator: Operator): boolean {
  if (isOperator(current(state), operator)) {
    state.index += 1;
    return true;
  }
  return false;
}

function expectOperator(state: ParserState, operator: Operator): void {
  if (!consumeOperator(state, operator)) {
    fail(state, `Expected "${operator}" but found ${describe(current(state))}`);
  }
}

function parsePrimary(state: ParserState): Expression {
  enter(state);
  try {
    const token = current(state);

    if (token.kind === "number") {
      state.index += 1;
      return { kind: "number", value: token.value };
    }

    if (token.kind === "string") {
      state.index += 1;
      return { kind: "string", value: token.value };
    }

    if (token.kind === "identifier") {
      state.index += 1;
      if (!consumeOperator(state, "(")) {
        return { kind: "variable", name: token.value };
      }
      const args: Expression[] = [];
      if (!consumeOperator(state, ")")) {
        do {
          args.push(parseExpression(state));
        } while (consumeOperator(state, ","));
        expectOperator(state, ")");
      }
      return { kind: "call", name: token.value, args };
    }

    if (isOperator(token, "(")) {
      state.index += 1;
      const inner = parseExpression(state);
      expectOperator(state, ")");
      return inner;
    }

    fail(state, `Expected a value but found ${describe(token)}`);
  } finally {
    exit(state);
  }
}

function parseUnary(state: ParserState): Expression {
  enter(state);
  try {
    const token = current(state);
    if (isOperator(token, "-") || isOperator(token, "+") || isOperator(token, "!")) {
      state.index += 1;
      const operand = parseUnary(state);
      return { kind: "unary", operator: token.value, operand };
    }
    return parsePower(state);
  } finally {
    exit(state);
  }
}

function parsePower(state: ParserState): Expression {
  enter(state);
  try {
    const base = parsePrimary(state);
    if (consumeOperator(state, "^")) {
      const exponent = parseUnary(state);
      return { kind: "binary", operator: "^", left: base, right: exponent };
    }
    return base;
  } finally {
    exit(state);
  }
}

function parseMultiplicative(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseUnary(state);
    for (;;) {
      const token = current(state);
      if (isOperator(token, "*") || isOperator(token, "/") || isOperator(token, "%")) {
        state.index += 1;
        const right = parseUnary(state);
        left = { kind: "binary", operator: token.value, left, right };
        continue;
      }
      return left;
    }
  } finally {
    exit(state);
  }
}

function parseAdditive(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseMultiplicative(state);
    for (;;) {
      const token = current(state);
      if (isOperator(token, "+") || isOperator(token, "-")) {
        state.index += 1;
        const right = parseMultiplicative(state);
        left = { kind: "binary", operator: token.value, left, right };
        continue;
      }
      return left;
    }
  } finally {
    exit(state);
  }
}

function parseComparison(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseAdditive(state);
    for (;;) {
      const token = current(state);
      if (
        isOperator(token, "<") ||
        isOperator(token, "<=") ||
        isOperator(token, ">") ||
        isOperator(token, ">=")
      ) {
        state.index += 1;
        const right = parseAdditive(state);
        left = { kind: "binary", operator: token.value, left, right };
        continue;
      }
      return left;
    }
  } finally {
    exit(state);
  }
}

function parseEquality(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseComparison(state);
    for (;;) {
      const token = current(state);
      if (isOperator(token, "==") || isOperator(token, "!=")) {
        state.index += 1;
        const right = parseComparison(state);
        left = { kind: "binary", operator: token.value, left, right };
        continue;
      }
      return left;
    }
  } finally {
    exit(state);
  }
}

function parseAnd(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseEquality(state);
    while (consumeOperator(state, "&&")) {
      const right = parseEquality(state);
      left = { kind: "binary", operator: "&&", left, right };
    }
    return left;
  } finally {
    exit(state);
  }
}

function parseOr(state: ParserState): Expression {
  enter(state);
  try {
    let left = parseAnd(state);
    while (consumeOperator(state, "||")) {
      const right = parseAnd(state);
      left = { kind: "binary", operator: "||", left, right };
    }
    return left;
  } finally {
    exit(state);
  }
}

function parseExpression(state: ParserState): Expression {
  enter(state);
  try {
    const condition = parseOr(state);
    if (!consumeOperator(state, "?")) {
      return condition;
    }
    const whenTrue = parseExpression(state);
    expectOperator(state, ":");
    const whenFalse = parseExpression(state);
    return { kind: "ternary", condition, whenTrue, whenFalse };
  } finally {
    exit(state);
  }
}

/** Parse an expression string into an AST. Never calls eval/new Function. */
export function parseFormula(expression: string): Expression {
  const state: ParserState = {
    tokens: tokenize(expression),
    source: expression,
    index: 0,
    depth: 0,
  };
  const ast = parseExpression(state);
  const trailing = current(state);
  if (trailing.kind !== "eof") {
    fail(state, `Unexpected ${describe(trailing)} after the end of the expression`);
  }
  return ast;
}
