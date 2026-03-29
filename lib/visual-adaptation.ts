/**
 * Visual Adaptation Engine
 *
 * Translates Bayesian cognitive style scores into concrete rendering
 * parameters (typography, chart preferences, layout density). Called
 * alongside buildAdaptationConfig — this controls HOW content looks,
 * while adaptation-engine controls WHAT content appears and in what order.
 *
 * Config is injected as CSS custom properties on <html> via applyVisualConfig(),
 * enabling instant full-page reflow without React re-renders.
 */

export interface StyleScores {
  visualizer: number;
  verbalizer: number;
  spatial: number;
}

export interface VisualAdaptationConfig {
  // Typography
  bodyFontSize:    number;   // px
  proseFontSize:   number;   // px
  lineHeight:      number;
  fontWeight:      number;

  // Chart preferences
  preferredChartType: 'scatter' | 'table' | 'bodymap' | 'bar';
  showDataLabels:     boolean;
  showGridlines:      boolean;
  colorIntensity:     'muted' | 'standard' | 'vivid';
  chartDensity:       'compact' | 'standard' | 'spacious';

  // Layout
  kpiValueSize:   number;   // px — DM Serif Display KPI value
  probeDepth:     'summary' | 'standard' | 'detailed';
  sectionSpacing: number;   // px gap between sections

  // Mode display
  modeLabel:       string;
  modeDescription: string;
}

export function buildVisualConfig(scores: StyleScores): VisualAdaptationConfig {
  const { visualizer: vz, verbalizer: vb, spatial: sp } = scores;

  const dominant =
    vz >= vb && vz >= sp ? 'visualizer' :
    vb >= vz && vb >= sp ? 'verbalizer' : 'spatial';

  return {
    // Typography: verbalizers get bigger, more readable text
    bodyFontSize:  vz > 0.6 ? 12 : vb > 0.6 ? 14 : 13,
    proseFontSize: Math.round(13 + vb * 2),           // 13–15px
    lineHeight:    parseFloat((1.6 + vb * 0.25).toFixed(2)), // 1.60–1.85
    fontWeight:    vb > 0.5 ? 400 : 300,

    // Charts: visualizers → scatter first; verbalizers → table first; spatial → bodymap
    preferredChartType:
      dominant === 'visualizer' ? 'scatter' :
      dominant === 'verbalizer' ? 'table'   : 'bodymap',
    showDataLabels: vz > 0.5,
    showGridlines:  vb > 0.4 || sp > 0.4,
    colorIntensity: sp > 0.5 ? 'vivid' : vz > 0.6 ? 'standard' : 'muted',
    chartDensity:   vz > 0.6 ? 'compact' : vb > 0.5 ? 'spacious' : 'standard',

    // Layout
    kpiValueSize:   vz > 0.6 ? 38 : vb > 0.6 ? 26 : 32,
    probeDepth:     vb > 0.6 ? 'detailed' : vz > 0.6 ? 'summary' : 'standard',
    sectionSpacing: Math.round(16 + vb * 16), // 16–32px

    modeLabel:
      dominant === 'visualizer' ? 'VISUALIZER MODE' :
      dominant === 'verbalizer' ? 'VERBALIZER MODE' : 'SPATIAL MODE',

    modeDescription:
      dominant === 'visualizer'
        ? 'Charts and visual encodings lead. Compact layout. Value labels on key data.'
      : dominant === 'verbalizer'
        ? 'Tables and prose lead. Larger text. Full narrative shown by default.'
        : 'Anatomical views and spatial encodings lead. High color contrast.',
  };
}

// Injects config as CSS custom properties on <html> — entire page reflows instantly
export function applyVisualConfig(config: VisualAdaptationConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--adapt-body-size',   `${config.bodyFontSize}px`);
  root.style.setProperty('--adapt-prose-size',  `${config.proseFontSize}px`);
  root.style.setProperty('--adapt-line-height', `${config.lineHeight}`);
  root.style.setProperty('--adapt-font-weight', `${config.fontWeight}`);
  root.style.setProperty('--adapt-spacing',     `${config.sectionSpacing}px`);
  root.style.setProperty('--adapt-kpi-size',    `${config.kpiValueSize}px`);
}
