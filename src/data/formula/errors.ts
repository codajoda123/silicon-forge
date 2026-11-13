/** Shared error type for the safe formula evaluator. */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}
