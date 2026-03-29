'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useGaze } from '@/lib/use-gaze';
import { loadPrior, posteriorMean, updatePosterior, savePrior } from '@/lib/bayesian-accumulator';
import { buildAdaptationConfig, checkInterventionTrigger, type AdaptationConfig, type SectionConfig } from '@/lib/adaptation-engine';
import { AOIManager } from '@/lib/aoi-manager';
import type { GazeSample } from '@/lib/ivt-fixation';
import { SOC_DATA, HYS_LAW_POINTS, AE_TABLE, AE_NARRATIVE, AE_SIGNALS_NARRATIVE, GRADE_COLORS } from '@/lib/clinical-data';
import type { StyleScores } from '@/lib/style-classifier';
import GazeHeatmap, { type GazeHeatmapHandle } from '@/components/GazeHeatmap';
import { getMedidataAEData, type MedidataAEResponse } from '@/lib/medidata-client';
import { buildVisualConfig, applyVisualConfig, type VisualAdaptationConfig } from '@/lib/visual-adaptation';
import { STORAGE_KEYS, GAZE_CONFIG, DWELL_EMPHASIS, BAYESIAN, HYS_LAW } from '@/lib/constants';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function socTotal(soc: typeof SOC_DATA[number]): number {
  return soc.g1 + soc.g2 + soc.g3 + soc.g4;
}

function gradeBadge(grade: number) {
  const bg = GRADE_COLORS[grade] ?? '#888';
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '8.5px', fontWeight: 600,
      background: bg, color: '#fff', padding: '1px 6px', borderRadius: '2px', letterSpacing: '0.02em',
    }}>
      G{grade}
    </span>
  );
}

/* ─── Intervention Alert ──────────────────────────────────────────────────── */

function InterventionAlert({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: 'var(--white)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--red)', padding: 16, width: 360,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9.5px', textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--red)', fontWeight: 600,
        }}>
          AdaptiView Alert
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0,
        }}>
          &times;
        </button>
      </div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

/* ─── Collapsible Section Card ────────────────────────────────────────────── */

type LiveEmphasis = 'none' | 'nudge' | 'urgent';

function SectionCard({ section, sectionRef, children, liveEmphasis = 'none' }: {
  section: SectionConfig;
  sectionRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  liveEmphasis?: LiveEmphasis;
}) {
  const [collapsed, setCollapsed] = useState(section.collapsed);

  // Auto-expand if adaptation escalates this section
  useEffect(() => {
    if (liveEmphasis === 'urgent' && collapsed) {
      setCollapsed(false);
    }
  }, [liveEmphasis, collapsed]);

  const borderLeft = liveEmphasis === 'urgent'
    ? '3px solid var(--red)'
    : liveEmphasis === 'nudge'
    ? '3px solid var(--amber)'
    : section.emphasis === 'high'
    ? '2px solid var(--accent)'
    : '1px solid var(--border)';

  const boxShadow = liveEmphasis === 'urgent'
    ? '0 0 12px rgba(224,60,60,0.15)'
    : liveEmphasis === 'nudge'
    ? '0 0 8px rgba(245,158,11,0.1)'
    : 'none';

  return (
    <div
      ref={sectionRef}
      data-section-id={section.id}
      style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderLeft, boxShadow, width: '100%',
        transition: 'border-left 0.4s ease, box-shadow 0.4s ease',
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'none', border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {section.label}
          {liveEmphasis === 'urgent' && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '8px', fontWeight: 700,
              background: 'rgba(224,60,60,0.12)', color: 'var(--red)',
              padding: '2px 6px', borderRadius: '2px', animation: 'pulse 2s infinite',
            }}>NEEDS REVIEW</span>
          )}
          {liveEmphasis === 'nudge' && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '8px', fontWeight: 700,
              background: 'rgba(245,158,11,0.12)', color: 'var(--amber)',
              padding: '2px 6px', borderRadius: '2px',
            }}>LOW ATTENTION</span>
          )}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="var(--text3)" strokeWidth="1.2" />
        </svg>
      </button>
      {!collapsed && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

/* ─── A. KPI Cards ────────────────────────────────────────────────────────── */

function KPICards() {
  const kpis = [
    { label: 'TOTAL AEs', value: '847', signal: false },
    { label: 'GRADE 3+', value: '31%', signal: false },
    { label: "HY'S LAW", value: '2 pts', signal: true },
    { label: 'DEATHS', value: '7', signal: false },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {kpis.map((k) => (
        <div key={k.label} style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--red)', padding: '14px 16px',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '9.5px', textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--text3)', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {k.label}
            {k.signal && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '8px', fontWeight: 700,
                background: 'rgba(224,60,60,0.12)', color: 'var(--red)',
                padding: '1px 5px', borderRadius: '2px',
              }}>SIGNAL</span>
            )}
          </div>
          <div className="stat-val-adaptive">
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── B. SOC Bar Chart ────────────────────────────────────────────────────── */

function SOCBarChart() {
  const maxTotal = Math.max(...SOC_DATA.map(socTotal));
  const barH = 22, gap = 8, labelW = 120, chartW = 380;
  const svgH = SOC_DATA.length * (barH + gap) - gap + 10;
  return (
    <svg width="100%" viewBox={`0 0 ${labelW + chartW + 20} ${svgH}`} style={{ display: 'block' }}>
      {SOC_DATA.map((row, i) => {
        const y = i * (barH + gap);
        const total = socTotal(row);
        const scale = (chartW - 20) / maxTotal;
        let x = labelW + 10;
        const segments = [
          { count: row.g1, color: GRADE_COLORS[1] },
          { count: row.g2, color: GRADE_COLORS[2] },
          { count: row.g3, color: GRADE_COLORS[3] },
          { count: row.g4, color: GRADE_COLORS[4] },
        ];
        return (
          <g key={row.soc}>
            <text x={labelW} y={y + barH / 2 + 4} textAnchor="end"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--text2)' }}>{row.soc}</text>
            {segments.map((seg, si) => {
              const w = seg.count * scale;
              const rect = <rect key={si} x={x} y={y} width={w} height={barH} fill={seg.color} />;
              x += w;
              return rect;
            })}
            <text x={x + 6} y={y + barH / 2 + 4}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text3)' }}>{total}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── C. Hy's Law Scatter ─────────────────────────────────────────────────── */

function HysLawScatter() {
  const w = 440, h = 300;
  const pad = { top: 20, right: 30, bottom: 40, left: 50 };
  const pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;
  const xMax = 10, yMax = 4;
  function sx(v: number) { return pad.left + (v / xMax) * pw; }
  function sy(v: number) { return pad.top + ph - (v / yMax) * ph; }

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {/* Hy's Law danger quadrant: ALT ≥3×ULN AND Bilirubin ≥2×ULN (FDA DILI Guidance 2009) */}
      <rect x={sx(HYS_LAW.ALT_ULN_THRESHOLD)} y={sy(yMax)} width={sx(xMax) - sx(HYS_LAW.ALT_ULN_THRESHOLD)} height={sy(HYS_LAW.BILI_ULN_THRESHOLD) - sy(yMax)} fill="rgba(224,60,60,0.06)" />
      <line x1={sx(HYS_LAW.ALT_ULN_THRESHOLD)} y1={sy(0)} x2={sx(HYS_LAW.ALT_ULN_THRESHOLD)} y2={sy(yMax)} stroke="var(--red)" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <line x1={sx(0)} y1={sy(HYS_LAW.BILI_ULN_THRESHOLD)} x2={sx(xMax)} y2={sy(HYS_LAW.BILI_ULN_THRESHOLD)} stroke="var(--red)" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <text x={sx(HYS_LAW.ALT_ULN_THRESHOLD) + 4} y={sy(yMax) + 14} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--red)', opacity: 0.6 }}>ALT={HYS_LAW.ALT_ULN_THRESHOLD}xULN</text>
      <text x={sx(0) + 4} y={sy(HYS_LAW.BILI_ULN_THRESHOLD) - 4} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--red)', opacity: 0.6 }}>Bili={HYS_LAW.BILI_ULN_THRESHOLD}xULN</text>
      <line x1={pad.left} y1={sy(0)} x2={sx(xMax)} y2={sy(0)} stroke="var(--border)" strokeWidth="1" />
      <line x1={pad.left} y1={sy(0)} x2={pad.left} y2={sy(yMax)} stroke="var(--border)" strokeWidth="1" />
      <text x={w / 2} y={h - 4} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text3)' }}>ALT (xULN)</text>
      <text x={12} y={h / 2} textAnchor="middle" transform={`rotate(-90 12 ${h / 2})`} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text3)' }}>Bilirubin (xULN)</text>
      {[0, 2, 4, 6, 8, 10].map(v => <text key={`x${v}`} x={sx(v)} y={sy(0) + 14} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text3)' }}>{v}</text>)}
      {[0, 1, 2, 3, 4].map(v => <text key={`y${v}`} x={pad.left - 8} y={sy(v) + 3} textAnchor="end" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text3)' }}>{v}</text>)}
      {HYS_LAW_POINTS.map(pt => (
        <g key={pt.pt}>
          <circle cx={sx(pt.alt)} cy={sy(pt.bili)} r={pt.danger ? 8 : 5} fill={pt.danger ? '#E03C3C' : '#3D8EFF'} opacity={0.85} />
          {pt.danger && <text x={sx(pt.alt) + 12} y={sy(pt.bili) + 3} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: '#E03C3C', fontWeight: 600 }}>{pt.pt}</text>}
        </g>
      ))}
    </svg>
  );
}

/* ─── D. Prose ────────────────────────────────────────────────────────────── */

function ProseBlock({ content, isSignal, probeDepth }: { content: string; isSignal?: boolean; probeDepth?: 'summary' | 'standard' | 'detailed' }) {
  const paragraphs = content.split('\n\n');
  const showParagraphs = probeDepth === 'summary' ? paragraphs.slice(0, 1) : paragraphs;
  return (
    <div className="prose-content" style={{ color: 'var(--text2)' }}>
      {showParagraphs.map((p, i) => {
        const hasSignal = p.includes('\u2019s Law') || p.includes('QTc') || p.includes('hepatotoxicity') || isSignal;
        return (
          <p key={i} style={{
            margin: '0 0 12px 0',
            ...(hasSignal ? { background: 'rgba(224,60,60,0.08)', borderLeft: '2px solid var(--red)', padding: '2px 6px' } : {}),
          }}>{p}</p>
        );
      })}
      {probeDepth === 'summary' && paragraphs.length > 1 && (
        <button style={{color:'var(--accent)',background:'none',border:'none',fontFamily:"'DM Mono',monospace",fontSize:11,cursor:'pointer',letterSpacing:'0.04em'}}>READ MORE &rarr;</button>
      )}
    </div>
  );
}

/* ─── E. AE Table ─────────────────────────────────────────────────────────── */

function AETableView() {
  const signalAEs = ['ALT Increased', 'QTc Prolongation'];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Adverse Event', 'SOC', 'Grade', 'n', '%', 'Arm'].map(col => (
              <th key={col} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text3)', padding: '8px 12px',
                borderBottom: '2px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap',
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AE_TABLE.map((row, i) => {
            const isSignal = signalAEs.includes(row.ae);
            return (
              <tr key={i} style={{
                background: isSignal ? 'rgba(224,60,60,0.04)' : 'transparent',
                borderLeft: isSignal ? '2px solid var(--red)' : '2px solid transparent',
              }}>
                <td style={{ fontFamily: 'var(--font-sans)', fontSize: 13, padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>{row.ae}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{row.soc}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>{gradeBadge(row.grade)}</td>
                <td style={{ fontFamily: 'var(--font-serif)', fontSize: 14, padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>{row.n}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{row.pct}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{row.arm}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', padding: '10px 12px 0' }}>
        Showing 1&ndash;15 of 847 results
      </div>
    </div>
  );
}

/* ─── F. Organ Heatmap ────────────────────────────────────────────────────── */

function OrganHeatmap() {
  const grades = [1, 2, 3, 4] as const;
  const maxVal = Math.max(...SOC_DATA.flatMap(r => [r.g1, r.g2, r.g3, r.g4]));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', padding: '6px 12px', borderBottom: '2px solid var(--border)', textAlign: 'left' }}>SOC</th>
            {grades.map(g => <th key={g} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', padding: '6px 12px', borderBottom: '2px solid var(--border)', textAlign: 'center', width: 70 }}>Grade {g}</th>)}
          </tr>
        </thead>
        <tbody>
          {SOC_DATA.map(row => {
            const vals = [row.g1, row.g2, row.g3, row.g4];
            return (
              <tr key={row.soc}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{row.soc}</td>
                {vals.map((v, gi) => {
                  const opacity = Math.max(0.08, v / maxVal);
                  const color = GRADE_COLORS[gi + 1];
                  return <td key={gi} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 12px', borderBottom: '1px solid var(--border)', background: `${color}${Math.round(opacity * 40).toString(16).padStart(2, '0')}`, color: 'var(--text)' }}>{v}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Section Renderer ────────────────────────────────────────────────────── */

function RenderSection({ section, probeDepth }: { section: SectionConfig; probeDepth?: 'summary' | 'standard' | 'detailed' }) {
  switch (section.id) {
    case 'ae-kpi': return <KPICards />;
    case 'ae-soc-chart': return <SOCBarChart />;
    case 'ae-hys-law': return <HysLawScatter />;
    case 'ae-narrative': return <ProseBlock content={AE_NARRATIVE} probeDepth={probeDepth} />;
    case 'ae-signals': return <ProseBlock content={AE_SIGNALS_NARRATIVE} isSignal probeDepth={probeDepth} />;
    case 'ae-table': return <AETableView />;
    case 'ae-organsys': return <OrganHeatmap />;
    default: return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', padding: 12 }}>Section &ldquo;{section.id}&rdquo; not available</div>;
  }
}

/* ─── Review Session Storage ──────────────────────────────────────────────── */

interface ReviewSession {
  timestamp: number;
  durationMs: number;
  sections: { id: string; label: string; dwellMs: number }[];
  interventionsFired: string[];
  cognitiveStyle: string;
  gazePoints?: { x: number; y: number; t: number }[];
}

function saveReviewSession(session: ReviewSession) {
  const existing: ReviewSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.REVIEW_SESSIONS) || '[]');
  existing.push(session);
  localStorage.setItem(STORAGE_KEYS.REVIEW_SESSIONS, JSON.stringify(existing));
}

/* ─── Dwell → StyleScores Classifier ─────────────────────────────────────── */
// Maps section dwell times to cognitive style signal strengths.
// Visual sections: charts/scatter (ae-soc-chart, ae-hys-law, ae-grade-pie)
// Verbal sections: prose/tables (ae-narrative, ae-signals, ae-table)
// Spatial sections: heatmaps/grids (ae-organsys)
// KPIs are neutral — everyone checks them.

const STYLE_MAP: Record<string, 'visual' | 'verbal' | 'spatial' | 'neutral'> = {
  'ae-kpi':       'neutral',
  'ae-soc-chart': 'visual',
  'ae-hys-law':   'visual',
  'ae-grade-pie': 'visual',
  'ae-narrative':  'verbal',
  'ae-signals':    'verbal',
  'ae-table':      'verbal',
  'ae-organsys':   'spatial',
};

function classifyDwellToScores(sections: { id: string; dwellMs: number }[]): StyleScores | null {
  let visualDwell = 0, verbalDwell = 0, spatialDwell = 0, totalStyled = 0;

  for (const sec of sections) {
    const cat = STYLE_MAP[sec.id] ?? 'neutral';
    if (cat === 'visual')  { visualDwell  += sec.dwellMs; totalStyled += sec.dwellMs; }
    if (cat === 'verbal')  { verbalDwell  += sec.dwellMs; totalStyled += sec.dwellMs; }
    if (cat === 'spatial') { spatialDwell += sec.dwellMs; totalStyled += sec.dwellMs; }
  }

  // Need sufficient non-neutral dwell to produce a meaningful signal
  if (totalStyled < BAYESIAN.MIN_STYLE_DWELL_MS) return null;

  const vz = visualDwell / totalStyled;
  const vb = verbalDwell / totalStyled;
  const sp = spatialDwell / totalStyled;

  const dominant: 'visualizer' | 'verbalizer' | 'spatial' =
    vz >= vb && vz >= sp ? 'visualizer' :
    vb >= vz && vb >= sp ? 'verbalizer' : 'spatial';

  // Confidence: how separated is the top style from uniform (0.33)?
  const sorted = [vz, vb, sp].sort((a, b) => b - a);
  const margin = sorted[0] - sorted[1];
  const confidence = Math.min(1, margin / 0.3);

  return { visualizer: vz, verbalizer: vb, spatial: sp, dominant, confidence };
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function StudyDetailPage() {
  const [config, setConfig] = useState<AdaptationConfig | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [gazeActive, setGazeActive] = useState(false);
  const [liveDwell, setLiveDwell] = useState<Record<string, number>>({});
  const [liveEmphasis, setLiveEmphasis] = useState<Record<string, LiveEmphasis>>({});
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  const [aeData, setAeData] = useState<MedidataAEResponse | null>(null);
  const [visualConfig, setVisualConfig] = useState<VisualAdaptationConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontOverride, setFontOverride] = useState<'small'|'default'|'large'>('default');

  // Gaze tracking
  const samplesRef = useRef<GazeSample[]>([]);
  const aoiRef = useRef<AOIManager | null>(null);
  const sectionRefsMap = useRef<Record<string, HTMLDivElement | null>>({});
  const startTimeRef = useRef(0);
  const interventionsFiredRef = useRef<string[]>([]);
  const dwellUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const heatmapRef = useRef<GazeHeatmapHandle>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  const onSample = useCallback((sample: GazeSample) => {
    samplesRef.current.push(sample);
    // Record into AOI manager for real-time dwell
    if (aoiRef.current) {
      aoiRef.current.recordFixation(sample.x, sample.y, 33);
    }
    // Feed into heatmap
    if (heatmapRef.current) {
      heatmapRef.current.addPoint(sample.x, sample.y, sample.t);
    }
  }, []);

  // Only start gaze if consent was given
  const hasConsent = typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEYS.GAZE_CONSENT) === 'true';
  const gaze = useGaze({ onSample });

  useEffect(() => {
    if (hasConsent && gaze.mode === 'webgazer') {
      setGazeActive(true);
      startTimeRef.current = Date.now();
    }
  }, [hasConsent, gaze.mode]);

  // Update AOI rects periodically
  useEffect(() => {
    if (!gazeActive || !config) return;
    const interval = setInterval(() => {
      const aois = config.aeReport
        .map(sec => {
          const el = sectionRefsMap.current[sec.id];
          if (!el) return null;
          return { id: sec.id, label: sec.label, rect: el.getBoundingClientRect() };
        })
        .filter(Boolean) as { id: string; label: string; rect: DOMRect }[];

      if (aois.length === 0) return;
      if (!aoiRef.current) {
        aoiRef.current = new AOIManager(aois);
      } else {
        aoiRef.current.updateRects(aois);
      }
    }, GAZE_CONFIG.AOI_REFRESH_MS);
    return () => clearInterval(interval);
  }, [gazeActive, config]);

  // Live dwell display update + live emphasis computation
  useEffect(() => {
    if (!gazeActive) return;
    dwellUpdateRef.current = setInterval(() => {
      if (aoiRef.current) {
        const results = aoiRef.current.getResults();
        const dwell: Record<string, number> = {};
        for (const r of results) dwell[r.aoiId] = r.dwellMs;
        setLiveDwell({ ...dwell });

        // Compute live emphasis: compare each section's dwell to the max
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed > GAZE_CONFIG.ORIENTING_DISCARD_MS && config) {
          const maxDwell = Math.max(...results.map(r => r.dwellMs), 1);
          const emphasis: Record<string, LiveEmphasis> = {};
          for (const r of results) {
            const ratio = r.dwellMs / maxDwell;
            const sec = config.aeReport.find(s => s.id === r.aoiId);
            const isSignal = sec?.emphasis === 'high';
            if (isSignal && ratio < DWELL_EMPHASIS.URGENT_RATIO && elapsed > GAZE_CONFIG.URGENT_DELAY_MS) {
              emphasis[r.aoiId] = 'urgent';
            } else if (ratio < DWELL_EMPHASIS.NUDGE_RATIO && elapsed > GAZE_CONFIG.NUDGE_DELAY_MS) {
              emphasis[r.aoiId] = 'nudge';
            } else {
              emphasis[r.aoiId] = 'none';
            }
          }
          setLiveEmphasis(emphasis);
        }

        // Check intervention triggers
        if (config) {
          for (const r of results) {
            if (interventionsFiredRef.current.includes(r.aoiId)) continue;
            const msg = checkInterventionTrigger(r.aoiId, r.dwellMs, config.layoutMode);
            if (msg && elapsed > GAZE_CONFIG.INTERVENTION_DELAY_MS) {
              setAlertMessage(msg);
              interventionsFiredRef.current.push(r.aoiId);
            }
          }
        }
      }
    }, GAZE_CONFIG.DWELL_UPDATE_MS);
    return () => { if (dwellUpdateRef.current) clearInterval(dwellUpdateRef.current); };
  }, [gazeActive, config]);

  // Save session on unmount + feed dwell back into Bayesian accumulator
  useEffect(() => {
    const firedRef = interventionsFiredRef.current;
    const heatmap = heatmapRef.current;
    return () => {
      if (!gazeActive || !config || !aoiRef.current) return;
      const results = aoiRef.current.getResults();
      // Downsample gaze points for storage (keep every 3rd point)
      const allPoints = heatmap?.getPoints() || [];
      const downsampled = allPoints.filter((_, i) => i % 3 === 0).map(p => ({ x: Math.round(p.x), y: Math.round(p.y), t: p.t }));

      const sectionDwell = results.map(r => ({
        id: r.aoiId,
        label: config.aeReport.find(s => s.id === r.aoiId)?.label || r.aoiId,
        dwellMs: r.dwellMs,
      }));

      saveReviewSession({
        timestamp: startTimeRef.current,
        durationMs: Date.now() - startTimeRef.current,
        sections: sectionDwell,
        interventionsFired: firedRef,
        cognitiveStyle: config.layoutMode,
        gazePoints: downsampled,
      });

      // ── Feedback loop: dwell → StyleScores → update Bayesian prior ──
      // This is what makes the adaptation actually learn across sessions.
      // Each review shifts the Dirichlet posterior so the NEXT session
      // gets a layout/typography config closer to the reviewer's actual style.
      const dwellScores = classifyDwellToScores(sectionDwell);
      if (dwellScores) {
        const prior = loadPrior();
        // observationStrength=3: review dwell is a weaker signal than
        // onboarding (which uses 5) since users may dwell on unfamiliar
        // formats rather than preferred ones. Still shifts the prior.
        const posterior = updatePosterior(prior, dwellScores, BAYESIAN.REVIEW_STRENGTH);
        savePrior(posterior);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gazeActive, config]);

  // Load adaptation config + visual config + Medidata data
  useEffect(() => {
    const prior = loadPrior();
    const scores = posteriorMean(prior);
    setSessionCount(prior.sessionCount);
    setConfidence(scores.confidence);

    if (prior.sessionCount === 0) {
      const defaultScores: StyleScores = {
        visualizer: 0.33, verbalizer: 0.33, spatial: 0.33,
        dominant: 'visualizer', confidence: 0,
      };
      setConfig(buildAdaptationConfig(defaultScores));
      const vConfig = buildVisualConfig(defaultScores);
      applyVisualConfig(vConfig);
      setVisualConfig(vConfig);
    } else {
      setConfig(buildAdaptationConfig(scores));
      const vConfig = buildVisualConfig(scores);
      applyVisualConfig(vConfig);
      setVisualConfig(vConfig);
    }

    // Fetch AE data from Medidata layer
    getMedidataAEData('CROWN-7').then(data => setAeData(data));
  }, []);

  if (!config) {
    return (
      <AppShell>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', padding: 32 }}>
          Loading adaptation config...
        </div>
      </AppShell>
    );
  }

  const sections = config.aeReport;

  // Layout sections into rows
  const rows: SectionConfig[][] = [];
  let currentRow: SectionConfig[] = [];
  let currentRowWidth = 0;
  for (const sec of sections) {
    const secWidth = sec.width === 'full' ? 1 : sec.width === 'half' ? 0.5 : 0.333;
    if (currentRowWidth + secWidth > 1.01) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [sec];
      currentRowWidth = secWidth;
    } else {
      currentRow.push(sec);
      currentRowWidth += secWidth;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return (
    <AppShell adaptationMode={config.layoutMode} sessionCount={sessionCount} confidence={confidence}>
      {/* Study Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400, color: 'var(--text)', margin: '0 0 4px 0' }}>
            CROWN-7 &mdash; NSCLC EGFR Phase III
          </h1>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
            NCT04567832 &middot; Data cut: 15-Mar-2026 &middot; N=624
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live gaze indicator */}
          {gazeActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Tracking
              </span>
            </div>
          )}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: config.accentColor,
            background: `${config.accentColor}12`, padding: '4px 10px', borderRadius: '2px',
            border: `1px solid ${config.accentColor}30`,
          }}>
            {visualConfig?.modeLabel || `${config.layoutMode.toUpperCase()} MODE`}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 0, padding: '6px 10px', cursor: 'pointer',
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: 'var(--text3)', letterSpacing: '0.06em',
            }}
          >
            &#9881; ADAPT
          </button>
        </div>
      </div>

      {/* Gaze controls toolbar */}
      {gazeActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '8px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', marginRight: 'auto' }}>
            Gaze Analysis
          </span>
          <button
            onClick={() => setHeatmapVisible(!heatmapVisible)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
              background: heatmapVisible ? 'rgba(61,142,255,0.1)' : 'var(--white)',
              color: heatmapVisible ? 'var(--accent)' : 'var(--text3)',
              border: `1px solid ${heatmapVisible ? 'rgba(61,142,255,0.3)' : 'var(--border)'}`,
              padding: '4px 12px', cursor: 'pointer',
            }}
          >
            {heatmapVisible ? 'Hide' : 'Show'} Heatmap
          </button>
          <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
            Heatmap overlays this document in real-time &middot; View full report in Attention Report
          </span>
        </div>
      )}

      {/* Tab - just Adverse Events */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--text)',
          background: 'none', border: 'none', borderBottom: '2px solid var(--accent)',
          padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          Adverse Events
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600, background: 'rgba(224,60,60,0.12)', color: 'var(--red)', padding: '1px 5px', borderRadius: '2px' }}>2</span>
        </button>
      </div>

      {/* Adaptive Content Sections — with heatmap overlay */}
      <div ref={contentAreaRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', overflow: 'hidden' }}>
        {/* Heatmap canvas overlay */}
        {gazeActive && (
          <GazeHeatmap
            ref={heatmapRef}
            visible={heatmapVisible}
            opacity={0.45}
            containerRef={contentAreaRef}
          />
        )}

        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 16 }}>
            {row.map((sec) => {
              const widthPct = sec.width === 'full' ? '100%' : sec.width === 'half' ? 'calc(50% - 8px)' : 'calc(33.33% - 11px)';
              return (
                <div key={sec.id} style={{ width: widthPct }}>
                  <SectionCard
                    section={sec}
                    sectionRef={(el) => { sectionRefsMap.current[sec.id] = el; }}
                    liveEmphasis={liveEmphasis[sec.id] || 'none'}
                  >
                    <RenderSection section={sec} probeDepth={visualConfig?.probeDepth} />
                  </SectionCard>
                  {/* Live dwell indicator */}
                  {gazeActive && liveDwell[sec.id] !== undefined && (
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)',
                      padding: '4px 0', textAlign: 'right',
                    }}>
                      Dwell: {(liveDwell[sec.id] / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Intervention Alert */}
      {alertMessage && (
        <InterventionAlert message={alertMessage} onClose={() => setAlertMessage(null)} />
      )}

      {/* Adaptation Settings Panel */}
      {settingsOpen && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
          background: 'white', borderLeft: '1px solid var(--border)',
          padding: 24, zIndex: 50, overflowY: 'auto',
        }}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:20}}>
            ADAPTATION SETTINGS
          </div>

          {/* Detected style */}
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:'var(--text3)',marginBottom:6,letterSpacing:'0.08em'}}>DETECTED STYLE</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:'var(--accent)'}}>{visualConfig?.modeLabel}</div>
            <div style={{fontFamily:"'Geist',sans-serif",fontSize:11.5,color:'var(--text3)',marginTop:4,lineHeight:1.5}}>{visualConfig?.modeDescription}</div>
          </div>

          {/* Font size override */}
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:'var(--text3)',marginBottom:8,letterSpacing:'0.08em'}}>FONT SIZE</div>
            <div style={{display:'flex',gap:8}}>
              {(['small','default','large'] as const).map(s => (
                <button key={s} style={{
                  flex:1, height:32, border:'1px solid var(--border)',
                  borderRadius:0, background: fontOverride===s ? 'var(--navy)' : 'white',
                  color: fontOverride===s ? 'white' : 'var(--text2)',
                  fontFamily:"'DM Mono',monospace", fontSize:10, cursor:'pointer',
                  letterSpacing:'0.06em', textTransform:'uppercase',
                }} onClick={() => {
                  setFontOverride(s);
                  const base = visualConfig?.bodyFontSize ?? 13;
                  const delta = s === 'small' ? -1 : s === 'large' ? 1 : 0;
                  document.documentElement.style.setProperty('--adapt-body-size', `${base + delta}px`);
                  document.documentElement.style.setProperty('--adapt-prose-size', `${(visualConfig?.proseFontSize ?? 13) + delta}px`);
                }}>
                  {s === 'small' ? 'A\u2212' : s === 'default' ? 'A' : 'A+'}
                </button>
              ))}
            </div>
          </div>

          {/* Chart type override */}
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:'var(--text3)',marginBottom:8,letterSpacing:'0.08em'}}>CHART TYPE</div>
            <div style={{display:'flex',gap:8}}>
              {(['scatter','table','bar'] as const).map(t => (
                <button key={t} style={{
                  flex:1, height:32, border:'1px solid var(--border)', borderRadius:0,
                  background: visualConfig?.preferredChartType===t ? 'var(--navy)' : 'white',
                  color: visualConfig?.preferredChartType===t ? 'white' : 'var(--text2)',
                  fontFamily:"'DM Mono',monospace", fontSize:9, cursor:'pointer',
                  letterSpacing:'0.04em', textTransform:'uppercase',
                }} onClick={() => {
                  if (visualConfig) setVisualConfig({ ...visualConfig, preferredChartType: t });
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Medidata source info */}
          {aeData && (
            <div style={{marginBottom:16, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)'}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9.5,color:'var(--text3)',marginBottom:6,letterSpacing:'0.08em'}}>DATA SOURCE</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:'var(--teal)'}}>● MEDIDATA RAVE</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:'var(--text3)',marginTop:4}}>
                Data as of: {aeData.dataAsOf}<br/>
                N={aeData.subjectCount} ({aeData.armBreakdown.drug} drug / {aeData.armBreakdown.control} control)
              </div>
            </div>
          )}

          {/* Reset */}
          <button onClick={() => {
            if (visualConfig) {
              applyVisualConfig(visualConfig);
              setFontOverride('default');
            }
          }} style={{
            fontFamily:"'DM Mono',monospace",fontSize:10,color:'var(--accent)',
            background:'none',border:'none',cursor:'pointer',letterSpacing:'0.04em',
            marginTop:8,
          }}>
            RESET TO DETECTED DEFAULTS &rarr;
          </button>

          <button onClick={() => setSettingsOpen(false)} style={{
            position:'absolute',top:16,right:16,background:'none',border:'none',
            fontSize:14,cursor:'pointer',color:'var(--text3)',
          }}>&times;</button>
        </div>
      )}
    </AppShell>
  );
}
