/**
 * AdaptiView Adaptation Engine
 *
 * Translates cognitive style scores into concrete layout decisions:
 * section ordering, emphasis levels, collapse states, and intervention
 * triggers. This is the bridge between "we know who you are" (Bayesian
 * accumulator) and "we show you what works for you" (dashboard rendering).
 *
 * Each layout mode (visualizer, verbalizer, spatial, blend) defines a
 * complete section configuration for each data domain (AE, Labs, Vitals).
 * Critical sections define minimum dwell thresholds that trigger real-time
 * intervention alerts when a reviewer skims past safety-relevant content.
 */

import type { StyleScores, CognitiveStyle } from './style-classifier';

// ─── Layout configuration output ───────────────────────────────────────────

export type ContentFormat = 'chart' | 'prose' | 'spatial' | 'table' | 'kpi-cards' | 'heatmap';
export type LayoutMode = 'visualizer' | 'verbalizer' | 'spatial' | 'blend';

export interface SectionConfig {
  id: string;
  label: string;
  format: ContentFormat;
  priority: number;       // 1 = show first, higher = show later
  collapsed: boolean;     // start collapsed (secondary content)
  emphasis: 'high' | 'medium' | 'low';
  width: 'full' | 'half' | 'third';
}

export interface InterventionConfig {
  dwellThresholdMs: number;    // below this = trigger intervention
  cooldownMs: number;          // min time between interventions
  maxPerSession: number;       // cap to avoid alert fatigue
  style: 'pulse' | 'overlay' | 'inline';  // how to surface it
}

export interface AdaptationConfig {
  layoutMode: LayoutMode;
  dominantStyle: CognitiveStyle;
  confidence: number;
  weights: {
    chartPriority: number;     // 0-1
    prosePriority: number;     // 0-1
    spatialPriority: number;   // 0-1
    tableDensity: number;      // 0-1 (high = show full tables, not truncated)
    colorDensity: number;      // 0-1 (high = rich color encoding)
    textFirst: boolean;
    chartsFirst: boolean;
    spatialFirst: boolean;
  };
  aeReport: SectionConfig[];
  labReport: SectionConfig[];
  vitalsReport: SectionConfig[];
  intervention: InterventionConfig;
  accentColor: string;
  narrativeDepth: 'brief' | 'moderate' | 'detailed';
}

// ─── Adaptation weight computation ─────────────────────────────────────────

function computeWeights(scores: StyleScores) {
  const { visualizer: vz, verbalizer: vb, spatial: sp } = scores;

  return {
    chartPriority:    Math.min(1, vz * 0.85 + sp * 0.45),
    prosePriority:    Math.min(1, vb * 0.90 + vz * 0.15),
    spatialPriority:  Math.min(1, sp * 0.90 + vz * 0.20),
    tableDensity:     Math.min(1, vb * 0.70 + vz * 0.35),
    colorDensity:     Math.min(1, vz * 0.80 + sp * 0.40),
    textFirst:        vb > 0.45,
    chartsFirst:      vz > 0.45 && vb < 0.40,
    spatialFirst:     sp > 0.45,
  };
}

// ─── Layout mode detection ──────────────────────────────────────────────────

function detectLayoutMode(scores: StyleScores): LayoutMode {
  const { visualizer: vz, verbalizer: vb, spatial: sp, confidence } = scores;
  // If confidence is low, blend all three
  if (confidence < 0.3) return 'blend';
  if (vz > 0.50) return 'visualizer';
  if (vb > 0.50) return 'verbalizer';
  if (sp > 0.50) return 'spatial';
  return 'blend';
}

// ─── Section configs per report per style ──────────────────────────────────

function buildAEReport(weights: ReturnType<typeof computeWeights>): SectionConfig[] {
  const sections: SectionConfig[] = [];

  if (weights.chartsFirst) {
    // Visualizer: charts dominate, prose is secondary
    sections.push(
      { id: 'ae-kpi',       label: 'Key Safety Metrics',           format: 'kpi-cards', priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-soc-chart', label: 'AEs by System Organ Class',    format: 'chart',     priority: 2, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-hys-law',   label: "Hy's Law Hepatotoxicity",      format: 'chart',     priority: 3, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'ae-grade-pie', label: 'Grade Distribution',           format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-narrative', label: 'Clinical Summary',             format: 'prose',     priority: 5, collapsed: true,  emphasis: 'low',    width: 'full' },
      { id: 'ae-table',     label: 'Full AE Listing',              format: 'table',     priority: 6, collapsed: false, emphasis: 'medium', width: 'full' },
    );
  } else if (weights.textFirst) {
    // Verbalizer: narrative first, charts support
    sections.push(
      { id: 'ae-narrative', label: 'Safety Summary',               format: 'prose',     priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-signals',   label: 'Signal Alerts',                format: 'prose',     priority: 2, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-table',     label: 'Adverse Event Listing',        format: 'table',     priority: 3, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-soc-chart', label: 'SOC Distribution Chart',       format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-hys-law',   label: "Hy's Law Scatter",             format: 'chart',     priority: 5, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-kpi',       label: 'Summary Statistics',           format: 'kpi-cards', priority: 6, collapsed: true,  emphasis: 'low',    width: 'full' },
    );
  } else if (weights.spatialFirst) {
    // Spatial: body map leads, drill-down by organ system
    sections.push(
      { id: 'ae-organsys',  label: 'AE by Organ System',            format: 'heatmap',   priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-kpi',       label: 'Key Safety Metrics',           format: 'kpi-cards', priority: 3, collapsed: false, emphasis: 'medium', width: 'full' },
      { id: 'ae-hys-law',   label: "Hy's Law Hepatotoxicity",      format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-soc-chart', label: 'AE SOC Chart',                 format: 'chart',     priority: 5, collapsed: false, emphasis: 'low',    width: 'half' },
      { id: 'ae-table',     label: 'Full AE Listing',              format: 'table',     priority: 6, collapsed: true,  emphasis: 'low',    width: 'full' },
    );
  } else {
    // Blend: balanced layout
    sections.push(
      { id: 'ae-kpi',       label: 'Key Safety Metrics',           format: 'kpi-cards', priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'ae-soc-chart', label: 'AEs by System Organ Class',    format: 'chart',     priority: 2, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'ae-narrative', label: 'Clinical Summary',             format: 'prose',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-hys-law',   label: "Hy's Law",                     format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-organsys',  label: 'Organ System Heatmap',         format: 'heatmap',   priority: 5, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'ae-table',     label: 'AE Listing',                   format: 'table',     priority: 6, collapsed: false, emphasis: 'medium', width: 'full' },
    );
  }

  return sections.sort((a, b) => a.priority - b.priority);
}

function buildLabReport(weights: ReturnType<typeof computeWeights>): SectionConfig[] {
  if (weights.chartsFirst) {
    return [
      { id: 'lab-trends',   label: 'ALT/AST Trend Lines',          format: 'chart',     priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'lab-heatmap',  label: 'Lab Value Heatmap',            format: 'heatmap',   priority: 2, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'lab-hys',      label: "Hy's Law",                     format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'lab-narrative',label: 'Lab Interpretation',           format: 'prose',     priority: 4, collapsed: true,  emphasis: 'low',    width: 'full' },
      { id: 'lab-table',    label: 'Flagged Values',               format: 'table',     priority: 5, collapsed: false, emphasis: 'medium', width: 'full' },
    ];
  } else if (weights.textFirst) {
    return [
      { id: 'lab-narrative',label: 'Laboratory Findings Summary',  format: 'prose',     priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'lab-table',    label: 'All Flagged Lab Values',       format: 'table',     priority: 2, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'lab-trends',   label: 'Hepatic Trend Chart',          format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'lab-hys',      label: "Hy's Law Scatter",             format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'lab-heatmap',  label: 'Lab Heatmap',                  format: 'heatmap',   priority: 5, collapsed: true,  emphasis: 'low',    width: 'full' },
    ];
  } else {
    return [
      { id: 'lab-heatmap',  label: 'Lab Value Heatmap',            format: 'heatmap',   priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'lab-hys',      label: "Hy's Law",                     format: 'chart',     priority: 2, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'lab-trends',   label: 'ALT/AST Trends',               format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'lab-narrative',label: 'Interpretation',               format: 'prose',     priority: 4, collapsed: false, emphasis: 'medium', width: 'full' },
      { id: 'lab-table',    label: 'Flagged Values',               format: 'table',     priority: 5, collapsed: false, emphasis: 'low',    width: 'full' },
    ];
  }
}

function buildVitalsReport(weights: ReturnType<typeof computeWeights>): SectionConfig[] {
  if (weights.chartsFirst) {
    return [
      { id: 'vitals-sparklines', label: 'All Vitals Overview',     format: 'chart',     priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'vitals-qtc',       label: 'QTc Distribution',         format: 'chart',     priority: 2, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'vitals-radar',     label: 'Arm Profile Radar',        format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'vitals-narrative', label: 'Vitals Summary',           format: 'prose',     priority: 4, collapsed: true,  emphasis: 'low',    width: 'full' },
      { id: 'vitals-table',     label: 'Vital Signs Listing',      format: 'table',     priority: 5, collapsed: false, emphasis: 'medium', width: 'full' },
    ];
  } else if (weights.textFirst) {
    return [
      { id: 'vitals-narrative', label: 'Vital Signs Summary',      format: 'prose',     priority: 1, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'vitals-table',     label: 'Vital Signs Listing',      format: 'table',     priority: 2, collapsed: false, emphasis: 'high',   width: 'full' },
      { id: 'vitals-qtc',       label: 'QTc Distribution',         format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'vitals-sparklines', label: 'Trend Charts',            format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'vitals-radar',     label: 'Arm Comparison',           format: 'chart',     priority: 5, collapsed: true,  emphasis: 'low',    width: 'full' },
    ];
  } else {
    return [
      { id: 'vitals-qtc-spatial', label: 'QTc Overview',             format: 'chart',     priority: 1, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'vitals-qtc',       label: 'QTc Distribution',         format: 'chart',     priority: 2, collapsed: false, emphasis: 'high',   width: 'half' },
      { id: 'vitals-radar',     label: 'Arm Profile Radar',        format: 'chart',     priority: 3, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'vitals-sparklines', label: 'Trend Lines',             format: 'chart',     priority: 4, collapsed: false, emphasis: 'medium', width: 'half' },
      { id: 'vitals-narrative', label: 'Clinical Notes',           format: 'prose',     priority: 5, collapsed: false, emphasis: 'low',    width: 'full' },
      { id: 'vitals-table',     label: 'All Vitals',               format: 'table',     priority: 6, collapsed: true,  emphasis: 'low',    width: 'full' },
    ];
  }
}

// ─── Intervention config by style ──────────────────────────────────────────

function buildInterventionConfig(layoutMode: LayoutMode): InterventionConfig {
  switch (layoutMode) {
    case 'visualizer':
      return { dwellThresholdMs: 400, cooldownMs: 90_000, maxPerSession: 3, style: 'pulse' };
    case 'verbalizer':
      return { dwellThresholdMs: 600, cooldownMs: 90_000, maxPerSession: 3, style: 'inline' };
    case 'spatial':
      return { dwellThresholdMs: 350, cooldownMs: 90_000, maxPerSession: 3, style: 'overlay' };
    default:
      return { dwellThresholdMs: 500, cooldownMs: 90_000, maxPerSession: 3, style: 'pulse' };
  }
}

// ─── Accent colors by style ─────────────────────────────────────────────────

const STYLE_ACCENT_COLORS: Record<LayoutMode, string> = {
  visualizer: '#3B82F6',  // blue — clinical, data-forward
  verbalizer: '#8B5CF6',  // violet — editorial, thoughtful
  spatial:    '#06B6D4',  // cyan — spatial, technical
  blend:      '#6366F1',  // indigo — neutral blend
};

// ─── Narrative depth by style ───────────────────────────────────────────────

function narrativeDepth(layoutMode: LayoutMode): 'brief' | 'moderate' | 'detailed' {
  if (layoutMode === 'verbalizer') return 'detailed';
  if (layoutMode === 'blend') return 'moderate';
  return 'brief';
}

// ─── MAIN EXPORT: buildAdaptationConfig ────────────────────────────────────

export function buildAdaptationConfig(scores: StyleScores): AdaptationConfig {
  const weights = computeWeights(scores);
  const layoutMode = detectLayoutMode(scores);

  return {
    layoutMode,
    dominantStyle: scores.dominant,
    confidence: scores.confidence,
    weights,
    aeReport: buildAEReport(weights),
    labReport: buildLabReport(weights),
    vitalsReport: buildVitalsReport(weights),
    intervention: buildInterventionConfig(layoutMode),
    accentColor: STYLE_ACCENT_COLORS[layoutMode],
    narrativeDepth: narrativeDepth(layoutMode),
  };
}

// ─── Intervention trigger logic ─────────────────────────────────────────────

export interface CriticalSection {
  id: string;
  label: string;
  minDwellMs: number;   // minimum acceptable dwell for this section
  riskLevel: 'high' | 'medium';
  message: Record<LayoutMode, string>;  // style-matched warning message
}

export const CRITICAL_SECTIONS: CriticalSection[] = [
  {
    id: 'ae-hys-law',
    label: "Hy's Law Hepatotoxicity",
    minDwellMs: 500,
    riskLevel: 'high',
    message: {
      visualizer: "⚠ Low dwell on Hy's Law scatter. 2 patients in danger quadrant — check chart.",
      verbalizer: "⚠ You spent less than 1 second on the hepatotoxicity section. ALT >3×ULN + Bilirubin >2×ULN detected in 2 patients — potential Hy's Law signal.",
      spatial:    "⚠ Hepatic region flagged. Hy's Law danger quadrant: 2 patients detected.",
      blend:      "⚠ Possible Hy's Law signal detected — review hepatotoxicity section.",
    },
  },
  {
    id: 'ae-cardiac',
    label: 'Cardiac AEs',
    minDwellMs: 400,
    riskLevel: 'high',
    message: {
      visualizer: "⚠ Cardiac AE rate 2.3× baseline — see chart.",
      verbalizer: "⚠ Cardiac adverse event rate was 2.3× the historical baseline for this drug class. Please review before completing safety sign-off.",
      spatial:    "⚠ Cardiovascular region: elevated AE burden detected.",
      blend:      "⚠ Cardiac AE signal — review recommended.",
    },
  },
  {
    id: 'vitals-qtc',
    label: 'QTc Prolongation',
    minDwellMs: 400,
    riskLevel: 'high',
    message: {
      visualizer: "⚠ QTc >450ms in 8 patients — review distribution chart.",
      verbalizer: "⚠ QTc prolongation exceeding 450ms was observed in 8 patients (1.3% of arm). This threshold is associated with increased arrhythmia risk.",
      spatial:    "⚠ Cardiac conduction system: QTc outliers flagged.",
      blend:      "⚠ QTc prolongation signal — 8 patients above 450ms threshold.",
    },
  },
];

export function checkInterventionTrigger(
  sectionId: string,
  dwellMs: number,
  layoutMode: LayoutMode
): string | null {
  const section = CRITICAL_SECTIONS.find(s => s.id === sectionId);
  if (!section) return null;
  if (dwellMs >= section.minDwellMs) return null;
  return section.message[layoutMode];
}