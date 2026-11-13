import { FormulaError } from "./errors";
import { parseFormula, type Expression } from "./parse";

export type FormulaValue = number | string | boolean;
export type FormulaVariables = Readonly<Record<string, FormulaValue>>;

interface FunctionSpec {
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly apply: (args: readonly number[]) => number;
}

const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  min: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, apply: (args) => Math.min(...args) },
  max: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, apply: (args) => Math.max(...args) },
  ceil: { minArgs: 1, maxArgs: 1, apply: (args) => Math.ceil(requireAt(args, 0)) },
  floor: { minArgs: 1, maxArgs: 1, apply: (args) => Math.floor(requireAt(args, 0)) },
  round: { minArgs: 1, maxArgs: 1, apply: (args) => Math.round(requireAt(args, 0)) },
  abs: { minArgs: 1, maxArgs: 1, apply: (args) => Math.abs(requireAt(args, 0)) },
  sqrt: { minArgs: 1, maxArgs: 1, apply: (args) => Math.sqrt(requireAt(args, 0)) },
  pow: { minArgs: 2, maxArgs: 2, apply: (args) => Math.pow(requireAt(args, 0), requireAt(args, 1)) },
  log2: { minArgs: 1, maxArgs: 1, apply: (args) => Math.log2(requireAt(args, 0)) },
  clamp: {
    minArgs: 3,
    maxArgs: 3,
    apply: (args) => Math.min(Math.max(requireAt(args, 0), requireAt(args, 1)), requireAt(args, 2)),
  },
};

function requireAt(args: readonly number[], index: number): number {
  const value = args[index];
  if (value === undefined) {
    throw new FormulaError(`Missing argument ${String(index + 1)}`);
  }
  return value;
}

function describeValue(value: FormulaValue): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

function asNumber(value: FormulaValue, expression: string, context: string): number {
  if (typeof value !== "number") {
    throw new FormulaError(
      `Expected a number ${context} but found ${describeValue(value)} in "${expression}"`,
    );
  }
  return value;
}

function asBoolean(value: FormulaValue, expression: string, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new FormulaError(
      `Expected a boolean ${context} but found ${describeValue(value)} in "${expression}"`,
    );
  }
  return value;
}

function ensureFinite(value: number, expression: string, context: string): number {
  if (!Number.isFinite(value)) {
    throw new FormulaError(`Formula produced a non-finite number ${context} in "${expression}"`);
  }
  return value;
}

function compare(
  operator: "<" | "<=" | ">" | ">=",
  left: number,
  right: number,
): boolean {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function arityError(
  name: string,
  spec: FunctionSpec,
  received: number,
  expression: string,
): FormulaError {
  const expected =
    spec.minArgs === spec.maxArgs
      ? String(spec.minArgs)
      : `${String(spec.minArgs)} to ${spec.maxArgs === Number.POSITIVE_INFINITY ? "any" : String(spec.maxArgs)}`;
  return new FormulaError(
    `Function "${name}" expects ${expected} argument(s) but received ${String(received)} in "${expression}"`,
  );
}

function checkCall(node: Extract<Expression, { kind: "call" }>, expression: string): void {
  const spec = FUNCTIONS[node.name];
  if (spec === undefined) {
    throw new FormulaError(
      `Unknown function "${node.name}" in "${expression}". Available: ${Object.keys(FUNCTIONS).join(", ")}`,
    );
  }
  if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
    throw arityError(node.name, spec, node.args.length, expression);
  }
  for (const arg of node.args) {
    checkExpression(arg, expression);
  }
}

function checkExpression(node: Expression, expression: string): void {
  switch (node.kind) {
    case "number":
    case "string":
    case "variable":
      return;
    case "unary":
      checkExpression(node.operand, expression);
      return;
    case "binary":
      checkExpression(node.left, expression);
      checkExpression(node.right, expression);
      return;
    case "ternary":
      checkExpression(node.condition, expression);
      checkExpression(node.whenTrue, expression);
      checkExpression(node.whenFalse, expression);
      return;
    case "call":
      checkCall(node, expression);
      return;
  }
}

/** Check function names and arities before any data file is accepted. */
export function validateExpression(node: Expression, expression: string): void {
  checkExpression(node, expression);
}

function evaluateCall(node: Extract<Expression, { kind: "call" }>, expression: string, variables: FormulaVariables): number {
  const spec = FUNCTIONS[node.name];
  if (spec === undefined) {
    throw new FormulaError(
      `Unknown function "${node.name}" in "${expression}". Available: ${Object.keys(FUNCTIONS).join(", ")}`,
    );
  }
  if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
    throw arityError(node.name, spec, node.args.length, expression);
  }
  const args = node.args.map((arg) =>
    asNumber(evaluateExpression(arg, expression, variables), expression, `as argument to ${node.name}()`),
  );
  return ensureFinite(spec.apply(args), expression, `from ${node.name}()`);
}

export function evaluateExpression(
  node: Expression,
  expression: string,
  variables: FormulaVariables,
): FormulaValue {
  switch (node.kind) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "variable": {
      const value = variables[node.name];
      if (value === undefined) {
        throw new FormulaError(`Unknown variable "${node.name}" in "${expression}"`);
      }
      return value;
    }
    case "unary": {
      if (node.operator === "!") {
        const operand = asBoolean(
          evaluateExpression(node.operand, expression, variables),
          expression,
          "after !",
        );
        return !operand;
      }
      const operand = asNumber(
        evaluateExpression(node.operand, expression, variables),
        expression,
        `after unary ${node.operator}`,
      );
      return node.operator === "-" ? -operand : operand;
    }
    case "binary":
      return evaluateBinary(node, expression, variables);
    case "ternary": {
      const condition = asBoolean(
        evaluateExpression(node.condition, expression, variables),
        expression,
        "as a ternary condition",
      );
      return condition
        ? evaluateExpression(node.whenTrue, expression, variables)
        : evaluateExpression(node.whenFalse, expression, variables);
    }
    case "call":
      return evaluateCall(node, expression, variables);
  }
}

function evaluateBinary(
  node: Extract<Expression, { kind: "binary" }>,
  expression: string,
  variables: FormulaVariables,
): FormulaValue {
  if (node.operator === "&&" || node.operator === "||") {
    const left = asBoolean(
      evaluateExpression(node.left, expression, variables),
      expression,
      `on the left of ${node.operator}`,
    );
    if (node.operator === "&&" && !left) {
      return false;
    }
    if (node.operator === "||" && left) {
      return true;
    }
    return asBoolean(
      evaluateExpression(node.right, expression, variables),
      expression,
      `on the right of ${node.operator}`,
    );
  }

  if (node.operator === "==" || node.operator === "!=") {
    const left = evaluateExpression(node.left, expression, variables);
    const right = evaluateExpression(node.right, expression, variables);
    if (typeof left !== typeof right) {
      throw new FormulaError(
        `Cannot compare ${typeof left} with ${typeof right} in "${expression}"`,
      );
    }
    const equal = left === right;
    return node.operator === "==" ? equal : !equal;
  }

  const left = asNumber(
    evaluateExpression(node.left, expression, variables),
    expression,
    `on the left of ${node.operator}`,
  );
  const right = asNumber(
    evaluateExpression(node.right, expression, variables),
    expression,
    `on the right of ${node.operator}`,
  );

  switch (node.operator) {
    case "+":
      return ensureFinite(left + right, expression, "from +");
    case "-":
      return ensureFinite(left - right, expression, "from -");
    case "*":
      return ensureFinite(left * right, expression, "from *");
    case "/":
      return ensureFinite(left / right, expression, "from /");
    case "%":
      return ensureFinite(left % right, expression, "from %");
    case "^":
      return ensureFinite(Math.pow(left, right), expression, "from ^");
    case "<":
    case "<=":
    case ">":
    case ">=":
      return compare(node.operator, left, right);
  }
}

/** Evaluate an expression string against numeric variables. */
export function evaluateFormula(expression: string, variables: FormulaVariables): FormulaValue {
  return evaluateExpression(parseFormula(expression), expression, variables);
}
