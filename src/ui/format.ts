const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const integerFormat = new Intl.NumberFormat("en-US");

export function formatMoney(value: number): string {
  return currencyFormat.format(value);
}

export function formatInteger(value: number): string {
  return integerFormat.format(value);
}

const compactFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

/** Compact instruction/operation counts: 1.25 M, 640 K, 812. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const absolute = Math.abs(value);
  if (absolute >= 1e9) {
    return `${compactFormat.format(value / 1e9)} G`;
  }
  if (absolute >= 1e6) {
    return `${compactFormat.format(value / 1e6)} M`;
  }
  if (absolute >= 1e3) {
    return `${compactFormat.format(value / 1e3)} K`;
  }
  return compactFormat.format(value);
}

/** Code size in bytes, KB or MB. */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (Math.abs(value) >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }
  return `${compactFormat.format(value)} B`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
