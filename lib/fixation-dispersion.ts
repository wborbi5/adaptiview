/**
 * Within-AOI Fixation Dispersion Metrics
 *
 * BCEA (Bivariate Contour Ellipse Area) measures gaze spread within
 * an AOI — tight clusters indicate focused reading, wide spread indicates
 * visual scanning. Aspect ratio differentiates horizontal reading patterns
 * from vertical/spatial exploration.
 */

import type { Fixation } from './ivt-fixation';

export interface DispersionMetrics {
  bcea: number;       // Bivariate contour ellipse area (px²)
  aspectRatio: number; // Horizontal vs vertical spread (>1 = horizontal reading pattern)
}

// Compute BCEA for a set of fixations within a single AOI
// Smaller BCEA = more concentrated gaze = focal processing
// Larger BCEA = more dispersed gaze = scanning/exploring
export function computeDispersion(fixations: Fixation[]): DispersionMetrics {
  if (fixations.length < 3) return { bcea: 0, aspectRatio: 1 };

  const xs = fixations.map(f => f.x);
  const ys = fixations.map(f => f.y);
  const n = xs.length;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let varX = 0, varY = 0, covXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    varX += dx * dx;
    varY += dy * dy;
    covXY += dx * dy;
  }
  varX /= n;
  varY /= n;
  covXY /= n;

  const sdX = Math.sqrt(varX);
  const sdY = Math.sqrt(varY);

  // Pearson correlation
  const rho = (sdX > 0 && sdY > 0) ? covXY / (sdX * sdY) : 0;

  // BCEA = 2π * k * σx * σy * sqrt(1 - ρ²)
  // k = chi-squared critical value for P=0.68 (1σ) with 2 df ≈ 2.291
  const k = 2.291;
  const bcea = 2 * Math.PI * k * sdX * sdY * Math.sqrt(Math.max(0, 1 - rho * rho));

  // Aspect ratio: horizontal spread / vertical spread
  const aspectRatio = sdY > 0 ? sdX / sdY : 1;

  return { bcea, aspectRatio };
}

// Normalize BCEA to [0,1] range
// 0 = very concentrated (< 5000 px²), 1 = very dispersed (> 80000 px²)
export function normalizeBCEA(bcea: number): number {
  return Math.min(1, Math.max(0, bcea / 80000));
}

// Normalize aspect ratio to [0,1]
// 0 = vertical scanning, 0.5 = balanced, 1 = strong horizontal (reading)
export function normalizeAspectRatio(ar: number): number {
  return Math.min(1, Math.max(0, ar / 3));
}
