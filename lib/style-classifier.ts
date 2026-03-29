/**
 * Cognitive Style Classifier — Nearest-Centroid with Softmax Ensemble
 *
 * Theoretical basis: Riding's Cognitive Styles Analysis (1991) extended
 * with Krejtz et al. ambient/focal gaze framework (2016).
 *
 * 13 features — all real, measurable signals from WebGazer gaze data:
 *   [textDwell%, chartDwell%, spatialDwell%, gazeTransitionEntropy,
 *    avgFixationDuration, transitionRate, focusRatio,
 *    meanSaccadeAmplitude, coefficientK, dwellDrift,
 *    bceaDispersion, aspectRatio, readingScore]
 */

export type CognitiveStyle = 'visualizer' | 'verbalizer' | 'spatial';

export interface StyleScores {
  visualizer: number;
  verbalizer: number;
  spatial: number;
  dominant: CognitiveStyle;
  confidence: number;
  rejected?: boolean;  // true if classification is too uncertain
}

// Centroids — 13 features
// Features: [textDwell, chartDwell, spatialDwell, GTE, avgFixDur, transRate, focusRatio, saccadeAmp, coeffK, dwellDrift, bcea, aspectRatio, readingScore]
const CENTROIDS: Record<CognitiveStyle, number[]> = {
  visualizer: [0.12, 0.55, 0.50, 0.20, 0.70, 0.18, 0.75, 0.25, 0.65, 0.10, 0.25, 0.35, 0.15],
  verbalizer: [0.65, 0.15, 0.12, 0.50, 0.40, 0.35, 0.60, 0.40, 0.55, 0.12, 0.40, 0.75, 0.80],
  spatial:    [0.25, 0.30, 0.65, 0.70, 0.30, 0.50, 0.45, 0.65, 0.25, 0.30, 0.65, 0.45, 0.25],
};

// Feature importance weights (sum = 1.0)
// Dwell: 42%, gaze dynamics: 33%, new dispersion/reading: 25%
const WEIGHTS = [
  0.15, 0.13, 0.14,   // dwell (42%)
  0.06, 0.06, 0.05, 0.06, 0.06, 0.06, 0.04,  // dynamics (39%)
  0.06, 0.06, 0.07,   // dispersion + reading (19%)
];

function weightedEuclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, ai, i) => sum + WEIGHTS[i] * (ai - b[i]) ** 2, 0));
}

// Ensemble: also compute Manhattan distance for robustness
function weightedManhattan(a: number[], b: number[]): number {
  return a.reduce((sum, ai, i) => sum + WEIGHTS[i] * Math.abs(ai - b[i]), 0);
}

const SOFTMAX_TEMP = 0.08;

function softmax(distances: number[], temp: number = SOFTMAX_TEMP): number[] {
  const exps = distances.map(d => Math.exp(-d / temp));
  const sum = exps.reduce((s, v) => s + v, 0);
  return exps.map(v => v / sum);
}

// Rejection thresholds
const ENTROPY_REJECTION_THRESHOLD = 0.95; // reject if classification entropy > 95% of max
const MARGIN_REJECTION_THRESHOLD = 0.05;  // reject if margin between top-2 < 5%

function classificationEntropy(scores: number[]): number {
  let h = 0;
  for (const p of scores) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h / Math.log2(scores.length); // normalize to [0,1]
}

// Temporal weighting: weight late-session features more heavily
export function applyTemporalWeighting(
  earlyFeatures: number[],
  lateFeatures: number[],
  earlyWeight: number = 0.3,
  lateWeight: number = 0.7
): number[] {
  return earlyFeatures.map((e, i) => e * earlyWeight + lateFeatures[i] * lateWeight);
}

export function classifyStyle(features: number[]): StyleScores {
  if (features.length !== 13) throw new Error('Expected 13 features');

  const clamped = features.map(f => Math.max(0, Math.min(1, f)));

  // Euclidean distances
  const eucDist = {
    visualizer: weightedEuclidean(clamped, CENTROIDS.visualizer),
    verbalizer: weightedEuclidean(clamped, CENTROIDS.verbalizer),
    spatial:    weightedEuclidean(clamped, CENTROIDS.spatial),
  };

  // Manhattan distances
  const manDist = {
    visualizer: weightedManhattan(clamped, CENTROIDS.visualizer),
    verbalizer: weightedManhattan(clamped, CENTROIDS.verbalizer),
    spatial:    weightedManhattan(clamped, CENTROIDS.spatial),
  };

  // Ensemble: average softmax from both distance metrics
  const eucScores = softmax([eucDist.visualizer, eucDist.verbalizer, eucDist.spatial]);
  const manScores = softmax([manDist.visualizer, manDist.verbalizer, manDist.spatial], 0.12);

  const vz = eucScores[0] * 0.6 + manScores[0] * 0.4;
  const vb = eucScores[1] * 0.6 + manScores[1] * 0.4;
  const sp = eucScores[2] * 0.6 + manScores[2] * 0.4;

  // Renormalize
  const total = vz + vb + sp;
  const scores = { visualizer: vz / total, verbalizer: vb / total, spatial: sp / total };

  const dominant = (Object.keys(scores) as CognitiveStyle[])
    .reduce((a, b) => scores[a] > scores[b] ? a : b);

  const MAX = scores[dominant];
  const confidence = Math.max(0, (MAX - 0.333) / 0.667);

  // Rejection check
  const scoreArr = [scores.visualizer, scores.verbalizer, scores.spatial];
  const entropy = classificationEntropy(scoreArr);
  const sorted = [...scoreArr].sort((a, b) => b - a);
  const margin = sorted[0] - sorted[1];
  const rejected = entropy > ENTROPY_REJECTION_THRESHOLD || margin < MARGIN_REJECTION_THRESHOLD;

  return { ...scores, dominant, confidence, rejected };
}

// EMA feedback loop for multi-session convergence
export function updateAffinityEMA(
  previous: Record<string, number>,
  sessionDwell: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of Object.keys(previous)) {
    result[key] = 0.7 * previous[key] + 0.3 * (sessionDwell[key] ?? previous[key]);
  }
  return result;
}