/**
 * Reading Behavior Detection
 *
 * Identifies text-reading patterns from saccade kinematics:
 * left-to-right dominance, horizontal bias, and regression rate.
 * High reading scores correlate with verbalizer cognitive style.
 * Based on Rayner (1998) reading saccade characteristics.
 */

import type { Fixation } from './ivt-fixation';

export interface ReadingMetrics {
  ltrRatio: number;        // Proportion of left-to-right saccades (0-1)
  horizontalBias: number;  // Ratio of horizontal vs vertical saccade amplitude (0-1 normalized)
  regressionRate: number;  // Proportion of right-to-left regressions (0-1)
  readingScore: number;    // Combined reading likelihood (0-1)
}

export function detectReadingBehavior(fixations: Fixation[]): ReadingMetrics {
  if (fixations.length < 5) {
    return { ltrRatio: 0, horizontalBias: 0.5, regressionRate: 0, readingScore: 0 };
  }

  let ltrCount = 0;    // left-to-right saccades
  let rtlCount = 0;    // right-to-left (regressions)
  let totalHorizontal = 0;
  let totalVertical = 0;


  for (let i = 1; i < fixations.length; i++) {
    const dx = fixations[i].x - fixations[i - 1].x;
    const dy = fixations[i].y - fixations[i - 1].y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    totalHorizontal += absDx;
    totalVertical += absDy;

    // Only count as L-to-R / R-to-L if primarily horizontal
    if (absDx > absDy * 0.5) {
      if (dx > 10) ltrCount++;       // forward saccade (reading direction)
      else if (dx < -10) rtlCount++; // regression
    }
  }

  const directionTotal = ltrCount + rtlCount;
  const ltrRatio = directionTotal > 0 ? ltrCount / directionTotal : 0;
  const regressionRate = directionTotal > 0 ? rtlCount / directionTotal : 0;

  // Horizontal bias: 0=vertical, 1=horizontal
  const totalMovement = totalHorizontal + totalVertical;
  const horizontalBias = totalMovement > 0 ? totalHorizontal / totalMovement : 0.5;

  // Combined reading score:
  // - High L-to-R ratio (0.6-0.8 typical for reading)
  // - Moderate regression rate (0.1-0.3 typical for reading)
  // - High horizontal bias (>0.6)
  const ltrScore = Math.min(1, ltrRatio / 0.7);
  const regScore = regressionRate > 0.05 && regressionRate < 0.4 ? 1 : 0.3;
  const hBiasScore = Math.min(1, horizontalBias / 0.65);
  const readingScore = (ltrScore * 0.45 + regScore * 0.2 + hBiasScore * 0.35);

  return { ltrRatio, horizontalBias, regressionRate, readingScore };
}

// Normalize reading score to [0,1] for feature vector
export function normalizeReadingScore(score: number): number {
  return Math.min(1, Math.max(0, score));
}
