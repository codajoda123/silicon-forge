/**
 * Shared "Why?" contributor shape from Section 17. Shares are fractions of
 * the displayed total and are intended to be ordered high-to-low.
 */
export interface Contributor {
  label: string;
  share: number;
  detail?: string;
}

export interface ContributorInput {
  label: string;
  value: number;
  detail?: string;
}

export interface ContributorOptions {
  limit?: number;
  otherLabel?: string;
}

/**
 * Turn raw positive contributions into ordered shares. Values beyond the
 * limit are folded into one "Other" row so the shares still sum to 1.
 */
export function buildContributors(
  inputs: readonly ContributorInput[],
  options: ContributorOptions = {},
): Contributor[] {
  const limit = options.limit ?? 5;
  const otherLabel = options.otherLabel ?? "Other contributors";
  const usable = inputs
    .map((input, index) => ({ ...input, index }))
    .filter((input) => Number.isFinite(input.value) && input.value > 0)
    .sort((a, b) => b.value - a.value || a.index - b.index);

  const total = usable.reduce((sum, input) => sum + input.value, 0);
  if (total <= 0) {
    return [];
  }

  const shown = usable.slice(0, Math.max(1, limit));
  const hidden = usable.slice(Math.max(1, limit));
  const contributors: Contributor[] = shown.map((input) => ({
    label: input.label,
    share: input.value / total,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  }));

  if (hidden.length > 0) {
    const hiddenValue = hidden.reduce((sum, input) => sum + input.value, 0);
    contributors.push({
      label: otherLabel,
      share: hiddenValue / total,
      detail: `${String(hidden.length)} more contribution${hidden.length === 1 ? "" : "s"}`,
    });
  }

  return contributors;
}
