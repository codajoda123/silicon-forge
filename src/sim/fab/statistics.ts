import type { Rng } from "../core/rng";

/** Standard normal sample via Box–Muller. Uses only the supplied RNG. */
export function sampleNormal(rng: Rng, mean: number, standardDeviation: number): number {
  if (standardDeviation <= 0) {
    return mean;
  }
  let u = rng.next();
  while (u <= Number.EPSILON) {
    u = rng.next();
  }
  const v = rng.next();
  const magnitude = Math.sqrt(-2 * Math.log(u));
  return mean + standardDeviation * magnitude * Math.cos(2 * Math.PI * v);
}

/** Knuth's method; a normal approximation keeps large bug counts cheap. */
export function samplePoisson(rng: Rng, mean: number): number {
  if (!(mean > 0)) {
    return 0;
  }
  if (mean > 30) {
    return Math.max(0, Math.round(sampleNormal(rng, mean, Math.sqrt(mean))));
  }
  const limit = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng.next();
  } while (product > limit);
  return count - 1;
}

/** Marsaglia–Tsang gamma sampler, used by the negative-binomial mixture. */
function sampleGamma(rng: Rng, shape: number, scale: number): number {
  if (shape < 1) {
    const boosted = sampleGamma(rng, shape + 1, scale);
    const u = Math.max(rng.next(), Number.EPSILON);
    return boosted * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = sampleNormal(rng, 0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v * scale;
    }
    if (u > Number.EPSILON && Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Section 11.3: Poisson defects mixed over a gamma defect-rate distribution,
 * which is the negative binomial used by the yield formula.
 */
export function sampleNegativeBinomial(rng: Rng, mean: number, alpha: number): number {
  if (!(mean > 0)) {
    return 0;
  }
  if (!(alpha > 0)) {
    return samplePoisson(rng, mean);
  }
  const lambda = sampleGamma(rng, alpha, mean / alpha);
  return samplePoisson(rng, lambda);
}