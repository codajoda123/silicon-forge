import { FormulaError } from "./errors";
import {
  evaluateExpression,
  validateExpression,
  type FormulaValue,
  type FormulaVariables,
} from "./evaluate";
import { parseFormula } from "./parse";

export { FormulaError } from "./errors";
export type { FormulaValue, FormulaVariables } from "./evaluate";
export type { Expression } from "./parse";

export interface CompiledFormula {
  readonly source: string;
  /** Evaluate to a number, string or boolean. */
  evaluate(variables: FormulaVariables): FormulaValue;
  /** Evaluate and require a finite number result. */
  evaluateNumber(variables: FormulaVariables): number;
}

/** Parse a formula once and return reusable evaluators. */
export function compileFormula(source: string): CompiledFormula {
  const ast = parseFormula(source);
  validateExpression(ast, source);
  return {
    source,
    evaluate(variables: FormulaVariables): FormulaValue {
      return evaluateExpression(ast, source, variables);
    },
    evaluateNumber(variables: FormulaVariables): number {
      const value = evaluateExpression(ast, source, variables);
      if (typeof value !== "number") {
        throw new FormulaError(
          `Expected a number result but found ${typeof value} in "${source}"`,
        );
      }
      if (!Number.isFinite(value)) {
        throw new FormulaError(`Formula produced a non-finite number in "${source}"`);
      }
      return value;
    },
  };
}

/** Evaluate a formula string to a number in one step. */
export function evaluateNumberFormula(source: string, variables: FormulaVariables): number {
  return compileFormula(source).evaluateNumber(variables);
}
