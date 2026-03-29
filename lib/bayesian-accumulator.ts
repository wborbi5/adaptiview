/**
 * Bayesian Dirichlet-Multinomial Multi-Session Accumulator
 *
 * Maintains a Dirichlet posterior over cognitive styles (visualizer, verbalizer,
 * spatial). Each onboarding round and review session contributes weighted
 * evidence, enabling the system to converge on a reviewer's true style over
 * multiple sessions without requiring explicit preference surveys.
 *
 * Mathematical basis: Dirichlet-Multinomial conjugate update.
 * The posterior mean yields style probabilities; the concentration parameter
 * (sum of alphas) encodes confidence from accumulated evidence.
 */

import type { CognitiveStyle, StyleScores } from './style-classifier';
import { STORAGE_KEYS } from './constants';

const STORAGE_KEY = STORAGE_KEYS.BAYESIAN_PRIOR;

// Dirichlet prior parameters (alpha values for each style)
// Uniform prior: alpha = [1, 1, 1] means no prior preference
export interface DirichletState {
  alpha: Record<CognitiveStyle, number>;
  sessionCount: number;
  lastUpdated: number;
}

const UNIFORM_PRIOR: DirichletState = {
  alpha: { visualizer: 1, verbalizer: 1, spatial: 1 },
  sessionCount: 0,
  lastUpdated: 0,
};

export function loadPrior(): DirichletState {
  if (typeof window === 'undefined') return { ...UNIFORM_PRIOR };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...UNIFORM_PRIOR };
    return JSON.parse(raw) as DirichletState;
  } catch {
    return { ...UNIFORM_PRIOR };
  }
}

export function savePrior(state: DirichletState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetPrior(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// Update the Dirichlet posterior with a new session's softmax scores.
// The "observation strength" scales how much each session shifts the posterior.
// Higher confidence sessions contribute more evidence.
export function updatePosterior(
  prior: DirichletState,
  sessionScores: StyleScores,
  observationStrength: number = 5
): DirichletState {
  const weight = observationStrength * Math.max(0.2, sessionScores.confidence);
  const newAlpha: Record<CognitiveStyle, number> = {
    visualizer: prior.alpha.visualizer + sessionScores.visualizer * weight,
    verbalizer: prior.alpha.verbalizer + sessionScores.verbalizer * weight,
    spatial: prior.alpha.spatial + sessionScores.spatial * weight,
  };
  return {
    alpha: newAlpha,
    sessionCount: prior.sessionCount + 1,
    lastUpdated: Date.now(),
  };
}

// Compute the posterior mean (expected probabilities) and confidence
export function posteriorMean(state: DirichletState): StyleScores {
  const total = state.alpha.visualizer + state.alpha.verbalizer + state.alpha.spatial;
  const scores = {
    visualizer: state.alpha.visualizer / total,
    verbalizer: state.alpha.verbalizer / total,
    spatial: state.alpha.spatial / total,
  };
  const dominant = (Object.keys(scores) as CognitiveStyle[])
    .reduce((a, b) => scores[a] > scores[b] ? a : b);

  // Confidence based on Dirichlet concentration:
  // Higher total alpha = more confident (more evidence accumulated)
  // Also factor in separation between top and second-best
  const sorted = Object.values(scores).sort((a, b) => b - a);
  const margin = sorted[0] - sorted[1];
  const confidence = Math.min(1, (Math.log(Math.max(total, 1)) / Math.log(30)) * margin * 3);

  return { ...scores, dominant, confidence };
}