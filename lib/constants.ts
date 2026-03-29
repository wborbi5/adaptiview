/**
 * AdaptiView — Centralized Constants
 *
 * All magic numbers, storage keys, and clinical thresholds live here.
 * In production, regulatory thresholds (Hy's Law, CTCAE grades, QTc cutoffs)
 * would be loaded from a validated configuration service to ensure alignment
 * with the latest FDA/ICH guidance.
 */

/* ─── localStorage / sessionStorage Keys ──────────────────────────────────── */

export const STORAGE_KEYS = {
  /** Dirichlet prior for Bayesian cognitive style accumulator */
  BAYESIAN_PRIOR:    'adaptiview_bayesian_prior',
  /** Reviewer profile (name, role) set at login */
  USER_PROFILE:      'adaptiview-user',
  /** Accumulated review session dwell + gaze data */
  REVIEW_SESSIONS:   'adaptiview-review-sessions',
  /** Session-scoped: camera consent granted for gaze tracking */
  GAZE_CONSENT:      'adaptiview-gaze-consent',
} as const;

/* ─── CTCAE Adverse Event Grading (v5.0) ──────────────────────────────────── */
// Reference: NCI Common Terminology Criteria for Adverse Events v5.0
// https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm

export const CTCAE = {
  /** Grade thresholds per CTCAE v5.0 */
  GRADE_MILD:     1,
  GRADE_MODERATE: 2,
  GRADE_SEVERE:   3,
  GRADE_LIFE_THREATENING: 4,
  GRADE_DEATH:    5,

  /** Grade 3+ is the standard safety signal threshold in Phase II/III */
  SIGNAL_THRESHOLD: 3,
} as const;

/* ─── Hy's Law Criteria (FDA Guidance 2009) ────────────────────────────────── */
// Reference: FDA Guidance for Industry — Drug-Induced Liver Injury (DILI)
// Hy's Law: ALT ≥3×ULN concurrent with TBili ≥2×ULN, absence of cholestasis

export const HYS_LAW = {
  /** ALT threshold: ≥3× upper limit of normal */
  ALT_ULN_THRESHOLD:  3,
  /** Total bilirubin threshold: ≥2× upper limit of normal */
  BILI_ULN_THRESHOLD: 2,
} as const;

/* ─── QTc Prolongation Thresholds (ICH E14) ───────────────────────────────── */
// Reference: ICH E14 — Clinical Evaluation of QT/QTc Interval Prolongation

export const QTC = {
  /** Borderline prolongation (ms) */
  BORDERLINE_MS: 450,
  /** Prolonged — triggers protocol hold per most study designs */
  PROLONGED_MS:  500,
} as const;

/* ─── Gaze Tracking Configuration ─────────────────────────────────────────── */

export const GAZE_CONFIG = {
  /** Minimum review session duration (ms) before dwell data is considered valid */
  MIN_SESSION_MS:       5000,
  /** Orienting period discarded from feature extraction (ms) */
  ORIENTING_DISCARD_MS: 8000,
  /** Heatmap gaussian brush radius (px) */
  HEATMAP_RADIUS:       55,
  /** Per-point intensity contribution to heatmap accumulation */
  HEATMAP_INTENSITY:    0.06,
  /** Heatmap render interval (ms) — ~5 fps */
  HEATMAP_RENDER_MS:    200,
  /** AOI rect refresh interval during live tracking (ms) */
  AOI_REFRESH_MS:       500,
  /** Live dwell + emphasis update interval (ms) */
  DWELL_UPDATE_MS:      1000,
  /** Minimum elapsed time before interventions can fire (ms) */
  INTERVENTION_DELAY_MS: 5000,
  /** Elapsed time before low-attention nudges activate (ms) */
  NUDGE_DELAY_MS:       12000,
  /** Elapsed time before urgent emphasis activates on signal sections (ms) */
  URGENT_DELAY_MS:      15000,
} as const;

/* ─── Bayesian Accumulator ────────────────────────────────────────────────── */

export const BAYESIAN = {
  /** Observation strength for onboarding sessions (high signal) */
  ONBOARD_STRENGTH:  5,
  /** Observation strength for review sessions (weaker signal — users may
   *  dwell on unfamiliar formats, not just preferred ones) */
  REVIEW_STRENGTH:   3,
  /** Minimum non-neutral dwell (ms) to produce a valid style signal */
  MIN_STYLE_DWELL_MS: 5000,
} as const;

/* ─── Dwell → Style Classification ────────────────────────────────────────── */

export const DWELL_EMPHASIS = {
  /** Ratio threshold: below this, section gets 'nudge' emphasis */
  NUDGE_RATIO:  0.15,
  /** Ratio threshold: below this on signal sections, gets 'urgent' */
  URGENT_RATIO: 0.10,
} as const;
