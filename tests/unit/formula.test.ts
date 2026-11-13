import { describe, expect, it } from "vitest";

import {
  FormulaError,
  compileFormula,
  evaluateNumberFormula,
  type FormulaVariables,
} from "../../src/data/formula";

const vars: FormulaVariables = { a: 2, b: 3, zero: 0, one: 1 };

describe("safe formula evaluator", () => {
  it("evaluates arithmetic with standard precedence", () => {
    expect(evaluateNumberFormula("1 + 2 * 3", {})).toBe(7);
    expect(evaluateNumberFormula("(1 + 2) * 3", {})).toBe(9);
    expect(evaluateNumberFormula("10 - 4 - 3", {})).toBe(3);
    expect(evaluateNumberFormula("10 / 4", {})).toBe(2.5);
    expect(evaluateNumberFormula("10 % 4", {})).toBe(2);
  });

  it("respects math precedence for powers and unary minus", () => {
    expect(evaluateNumberFormula("2 ^ 3 ^ 2", {})).toBe(512);
    expect(evaluateNumberFormula("-2 ^ 2", {})).toBe(-4);
    expect(evaluateNumberFormula("2 ^ -2", {})).toBe(0.25);
    expect(evaluateNumberFormula("(-2) ^ 2", {})).toBe(4);
  });

  it("reads variables and calls built-in functions", () => {
    expect(evaluateNumberFormula("a + b", vars)).toBe(5);
    expect(evaluateNumberFormula("min(a, b, 1)", vars)).toBe(1);
    expect(evaluateNumberFormula("max(a, b, 1)", vars)).toBe(3);
    expect(evaluateNumberFormula("clamp(a + 10, 0, 5)", vars)).toBe(5);
    expect(evaluateNumberFormula("round(sqrt(16) + pow(2, 3))", vars)).toBe(12);
    expect(evaluateNumberFormula("ceil(log2(8))", vars)).toBe(3);
    expect(evaluateNumberFormula("abs(-7) + floor(2.9)", vars)).toBe(9);
  });

  it("evaluates comparisons, booleans and lazy ternaries", () => {
    const formula = compileFormula("a < b && b <= 3 ? 10 : 20");
    expect(formula.evaluateNumber(vars)).toBe(10);
    expect(evaluateNumberFormula("a > b || zero == 0 ? 1 : 0", vars)).toBe(1);
    expect(evaluateNumberFormula("one != 1 ? 1 : 0", vars)).toBe(0);
    expect(evaluateNumberFormula("!(a > b) ? 1 : 0", vars)).toBe(1);
  });

  it("only evaluates the selected ternary branch", () => {
    const guard = compileFormula("one == 1 ? 42 : missing_variable");
    expect(guard.evaluateNumber(vars)).toBe(42);

    const guardedDivide = compileFormula("zero == 0 ? 0 : 10 / zero");
    expect(guardedDivide.evaluateNumber(vars)).toBe(0);
  });

  it("supports string equality and string results", () => {
    const formula = compileFormula("'cmos' == 'cmos' ? 'yes' : 'no'");
    expect(formula.evaluate({})).toBe("yes");
    expect(() => formula.evaluateNumber({})).toThrow(FormulaError);
  });

  it("rejects unknown variables and functions with clear messages", () => {
    expect(() => evaluateNumberFormula("missing + 1", {})).toThrow(/Unknown variable "missing"/);
    expect(() => evaluateNumberFormula("explode(1)", {})).toThrow(/Unknown function "explode"/);
  });

  it("rejects non-finite arithmetic", () => {
    expect(() => evaluateNumberFormula("1 / 0", {})).toThrow(/non-finite/);
    expect(() => evaluateNumberFormula("sqrt(-1)", {})).toThrow(/non-finite/);
    expect(() => evaluateNumberFormula("1 % 0", {})).toThrow(/non-finite/);
  });

  it("rejects mismatched types instead of coercing", () => {
    expect(() => evaluateNumberFormula("'1' + 1", {})).toThrow(/Expected a number/);
    expect(() => evaluateNumberFormula("1 ? 2 : 3", {})).toThrow(/Expected a boolean/);
    expect(() => evaluateNumberFormula("1 && 1", {})).toThrow(/Expected a boolean/);
    expect(() => evaluateNumberFormula("'a' == 1", {})).toThrow(/Cannot compare/);
    expect(() => evaluateNumberFormula("'a' < 'b'", {})).toThrow(/Expected a number/);
  });

  it("rejects malformed formulas with positions", () => {
    expect(() => compileFormula("1 +")).toThrow(/Expected a value but found end of formula/);
    expect(() => compileFormula("(1 + 2")).toThrow(/Expected "\)"/);
    expect(() => compileFormula("1 2")).toThrow(/Unexpected "2" after the end/);
    expect(() => compileFormula("1 @ 2")).toThrow(/Unexpected character "@"/);
    expect(() => compileFormula("'open")).toThrow(/Unterminated string/);
    expect(() => compileFormula("a ? 1")).toThrow(/Expected ":"/);
  });

  it("rejects arity errors and deep nesting", () => {
    expect(() => compileFormula("min()")).toThrow(/expects 1 to any argument/);
    expect(() => compileFormula("clamp(1, 2)")).toThrow(/expects 3 argument/);
    expect(() => compileFormula("pow(2)")).toThrow(/expects 2 argument/);
    expect(() => compileFormula("round(2, 2)")).toThrow(/expects 1 argument/);
    expect(() => compileFormula(`${"(".repeat(400)}1${")".repeat(400)}`)).toThrow(
      /nesting is deeper/,
    );
  });

  it("enforces a maximum formula length", () => {
    expect(() => compileFormula(`1+${"1".repeat(2048)}`)).toThrow(/longer than 2048/);
  });

  it("recognises scientific notation and decimals", () => {
    expect(evaluateNumberFormula("1e3 + .5", {})).toBe(1000.5);
    expect(evaluateNumberFormula("2.5e-1", {})).toBe(0.25);
  });

  it("cannot be used to execute JavaScript", () => {
    const injections = [
      "constructor.constructor('return 1')()",
      "globalThis.process",
      "eval('1')",
      "[].constructor",
    ];
    for (const injection of injections) {
      expect(() => compileFormula(injection).evaluate({})).toThrow(FormulaError);
    }
  });
});
