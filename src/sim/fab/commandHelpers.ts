import { appendGameEvent } from "../core/events";
import { getPlayerCompany, type GameState } from "../core/state";
import { productForDesign } from "./state";
import type { ManufacturingCommandResult } from "./commandTypes";
import type { ManufacturingState, Product, Sku } from "./types";

export function unchanged(state: GameState, failure: string): ManufacturingCommandResult {
  return { state, event: null, failure };
}

export function spendCash(state: GameState, amount: number): GameState {
  return {
    ...state,
    companies: state.companies.map((company) =>
      company.isPlayer ? { ...company, cash: company.cash - amount } : company,
    ),
  };
}

export function canAfford(state: GameState, amount: number): boolean {
  return getPlayerCompany(state).cash >= amount;
}

export function withManufacturing(
  state: GameState,
  manufacturing: ManufacturingState,
): GameState {
  return { ...state, manufacturing };
}

/**
 * Create or update a product stack. Auto-suggest and explicit edits replace
 * the stack; tape-out and erratum acceptance only fill in a missing product so
 * a player's hand-built SKUs are never overwritten by the suggestion engine.
 */
export function ensureProduct(
  state: GameState,
  designId: string,
  skus: readonly Sku[],
  launchedWeek: number | null,
  replaceStack: boolean,
): GameState {
  const existing = productForDesign(state.manufacturing, designId);
  if (existing !== undefined) {
    const nextLaunchedWeek =
      launchedWeek !== null && existing.launchedWeek === null
        ? launchedWeek
        : existing.launchedWeek;
    if (!replaceStack) {
      if (nextLaunchedWeek === existing.launchedWeek) {
        return state;
      }
      const launched: Product = { ...existing, launchedWeek: nextLaunchedWeek };
      return withManufacturing(state, {
        ...state.manufacturing,
        products: state.manufacturing.products.map((product) =>
          product.id === existing.id ? launched : product,
        ),
      });
    }
    const next: Product = {
      ...existing,
      skus: skus.map((sku) => ({ ...sku })),
      launchedWeek: nextLaunchedWeek,
    };
    return withManufacturing(state, {
      ...state.manufacturing,
      products: state.manufacturing.products.map((product) =>
        product.id === existing.id ? next : product,
      ),
    });
  }
  const product: Product = {
    id: `product-${designId}`,
    designId,
    skus: skus.map((sku) => ({ ...sku })),
    launchedWeek,
  };
  return withManufacturing(state, {
    ...state.manufacturing,
    products: [...state.manufacturing.products, product],
  });
}

export function finished(
  state: GameState,
  kind: Parameters<typeof appendGameEvent>[1],
  message: string,
): ManufacturingCommandResult {
  const recorded = appendGameEvent(state, kind, message);
  return { state: recorded.state, event: recorded.event };
}