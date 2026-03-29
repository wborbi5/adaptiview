'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { loadPrior, posteriorMean } from '@/lib/bayesian-accumulator';
import type { StyleScores } from '@/lib/style-classifier';
import { buildAdaptationConfig } from '@/lib/adaptation-engine';
import { STORAGE_KEYS } from '@/lib/constants';

/* ─── Types (mirrors study detail page) ──────────────────────────────────── */

interface ReviewSession {
  timestamp: number;
  durationMs: number;
  sections: { id: string; label: string; dwellMs: number }[];
  interventionsFired: string[];
  cognitiveStyle: string;
  gazePoints?: { x: number; y: number; t: number }[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function loadSessions(): ReviewSession[] {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.REVIEW_SESSIONS) || '[]');
}

/* ─── Section header ────────────────────────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-4" style={{ color: 'var(--text3)' }}>
      {children}
    </h2>
  );
}

/* ─── Heatmap rendering helpers (shared with GazeHeatmap.tsx) ─────────────── */

const REPLAY_RADIUS = 40;
const REPLAY_INTENSITY = 0.08;

function replayIntensityToColor(val: number): [number, number, number, number] {
  const v = Math.min(1, Math.max(0, val));
  let r = 0, g = 0, b = 0;
  if (v < 0.2) {
    const t = v / 0.2;
    r = 30; g = Math.round(80 + t * 120); b = Math.round(200 + t * 55);
  } else if (v < 0.45) {
    const t = (v - 0.2) / 0.25;
    r = 0; g = Math.round(200 + t * 55); b = Math.round(255 * (1 - t));
  } else if (v < 0.7) {
    const t = (v - 0.45) / 0.25;
    r = Math.round(t * 255); g = 255; b = 0;
  } else {
    const t = (v - 0.7) / 0.3;
    r = 255; g = Math.round(200 * (1 - t)); b = 0;
  }
  const alpha = Math.min(220, Math.round(v * 300));
  return [r, g, b, alpha];
}

function makeGaussianBrush(radius: number): HTMLCanvasElement {
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0.7)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ─── Build document layout from adaptation config ─────────────────────── */

interface DocSection {
  id: string;
  label: string;
  width: 'full' | 'half' | 'third';
  format: string;
}

interface DocRow {
  sections: DocSection[];
}

function buildDocLayout(cognitiveStyle: string): DocRow[] {
  // Reconstruct the adaptation config from the cognitive style used during review
  const fakeScores: StyleScores = {
    visualizer: cognitiveStyle === 'visualizer' ? 0.6 : 0.2,
    verbalizer: cognitiveStyle === 'verbalizer' ? 0.6 : 0.2,
    spatial: cognitiveStyle === 'spatial' ? 0.6 : 0.2,
    dominant: cognitiveStyle as 'visualizer' | 'verbalizer' | 'spatial',
    confidence: 0.7,
  };
  const config = buildAdaptationConfig(fakeScores);
  const sections = config.aeReport;

  // Lay out into rows (same logic as study detail page)
  const rows: DocRow[] = [];
  let currentRow: DocSection[] = [];
  let currentRowWidth = 0;
  for (const sec of sections) {
    const secWidth = sec.width === 'full' ? 1 : sec.width === 'half' ? 0.5 : 0.333;
    if (currentRowWidth + secWidth > 1.01) {
      if (currentRow.length > 0) rows.push({ sections: currentRow });
      currentRow = [{ id: sec.id, label: sec.label, width: sec.width, format: sec.format }];
      currentRowWidth = secWidth;
    } else {
      currentRow.push({ id: sec.id, label: sec.label, width: sec.width, format: sec.format });
      currentRowWidth += secWidth;
    }
  }
  if (currentRow.length > 0) rows.push({ sections: currentRow });
  return rows;
}

const FORMAT_HEIGHTS: Record<string, number> = {
  'kpi-cards': 56,
  'chart': 130,
  'heatmap': 130,
  'table': 160,
  'prose': 90,
};

/* ─── Gaze Replay Heatmap — renders saved gaze points over document layout ── */

function GazeReplayHeatmap({ sessions, selectedIdx }: { sessions: ReviewSession[]; selectedIdx: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetSessions = selectedIdx !== null ? [sessions[selectedIdx]] : sessions;
  const allPoints = targetSessions.flatMap(s => s.gazePoints || []);
  const totalPoints = allPoints.length;

  // Build the real document layout from the cognitive style used during review
  const style = targetSessions[0]?.cognitiveStyle || 'visualizer';
  const docRows = buildDocLayout(style);

  // Aggregate dwell for section labels
  const dwellMap = new Map<string, number>();
  for (const s of targetSessions) {
    for (const sec of s.sections) {
      dwellMap.set(sec.id, (dwellMap.get(sec.id) || 0) + sec.dwellMs);
    }
  }

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || allPoints.length === 0) return;

    const W = container.offsetWidth;
    const H = container.offsetHeight;
    if (W === 0 || H === 0) return;

    // Use a smaller render resolution for performance, then CSS scales it up
    const scale = 0.5;
    const rW = Math.round(W * scale);
    const rH = Math.round(H * scale);

    if (canvas.width !== rW || canvas.height !== rH) {
      canvas.width = rW;
      canvas.height = rH;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, rW, rH);

    // Find bounds of original gaze data to map into our container
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of allPoints) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const dataW = Math.max(maxX - minX, 1);
    const dataH = Math.max(maxY - minY, 1);

    // Map points into render coordinates with padding
    const pad = 10 * scale;
    const scaleX = (rW - pad * 2) / dataW;
    const scaleY = (rH - pad * 2) / dataH;
    const brushR = Math.round(REPLAY_RADIUS * scale);

    // Accumulate intensity
    const offscreen = document.createElement('canvas');
    offscreen.width = rW;
    offscreen.height = rH;
    const offCtx = offscreen.getContext('2d')!;
    offCtx.globalCompositeOperation = 'lighter';

    const brush = makeGaussianBrush(brushR);
    for (const pt of allPoints) {
      const mx = pad + (pt.x - minX) * scaleX;
      const my = pad + (pt.y - minY) * scaleY;
      offCtx.globalAlpha = REPLAY_INTENSITY;
      offCtx.drawImage(brush, mx - brushR, my - brushR);
    }

    // Colorize
    const intensityData = offCtx.getImageData(0, 0, rW, rH);
    const colorData = ctx.createImageData(rW, rH);
    for (let i = 0; i < intensityData.data.length; i += 4) {
      const intensity = intensityData.data[i + 3] / 255;
      if (intensity < 0.008) continue;
      const [r, g, b, a] = replayIntensityToColor(intensity);
      colorData.data[i] = r;
      colorData.data[i + 1] = g;
      colorData.data[i + 2] = b;
      colorData.data[i + 3] = a;
    }
    ctx.putImageData(colorData, 0, 0);
  }, [allPoints]);

  useEffect(() => {
    // Defer render so the page paints first
    const raf = requestAnimationFrame(() => renderCanvas());
    return () => cancelAnimationFrame(raf);
  }, [renderCanvas]);

  // Re-render on resize
  useEffect(() => {
    let raf = 0;
    const handler = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => renderCanvas()); };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); cancelAnimationFrame(raf); };
  }, [renderCanvas]);

  if (totalPoints === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <span className="font-mono text-[12px]" style={{ color: 'var(--text3)' }}>
          No gaze point data recorded for this selection
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase block" style={{ color: 'var(--text3)' }}>Gaze Points</span>
          <span className="font-serif text-[20px]" style={{ color: 'var(--text)' }}>{totalPoints.toLocaleString()}</span>
        </div>
        <div>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase block" style={{ color: 'var(--text3)' }}>Sessions</span>
          <span className="font-serif text-[20px]" style={{ color: 'var(--text)' }}>{targetSessions.length}</span>
        </div>
      </div>

      {/* Document mockup with heatmap overlay */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          background: '#1a1f2e',
          border: '1px solid var(--border)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Document section outlines — matches real study layout */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docRows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8 }}>
              {row.sections.map((sec) => {
                const dwell = dwellMap.get(sec.id) || 0;
                const widthPct = sec.width === 'full' ? '100%' : sec.width === 'half' ? 'calc(50% - 4px)' : 'calc(33.33% - 6px)';
                const height = FORMAT_HEIGHTS[sec.format] || 100;
                return (
                  <div
                    key={sec.id}
                    style={{
                      width: widthPct,
                      height,
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 3,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {sec.label}
                        </span>
                        {dwell > 0 && (
                          <span className="font-mono text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {fmtMs(dwell)}
                          </span>
                        )}
                      </div>
                      {/* Placeholder content to mimic document */}
                      {(sec.format === 'chart' || sec.format === 'heatmap') && (
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: height - 44, opacity: 0.15 }}>
                          {Array.from({ length: 12 }, (_, j) => (
                            <div key={j} style={{
                              flex: 1,
                              height: `${20 + Math.sin(j * 0.8) * 30 + Math.random() * 50}%`,
                              background: 'rgba(255,255,255,0.4)',
                              borderRadius: 1,
                            }} />
                          ))}
                        </div>
                      )}
                      {sec.format === 'table' && (
                        <div style={{ opacity: 0.12 }}>
                          {Array.from({ length: 5 }, (_, j) => (
                            <div key={j} style={{
                              height: 8, marginBottom: 6,
                              background: 'rgba(255,255,255,0.4)',
                              width: j === 0 ? '100%' : `${60 + Math.random() * 40}%`,
                              borderRadius: 1,
                            }} />
                          ))}
                        </div>
                      )}
                      {sec.format === 'prose' && (
                        <div style={{ opacity: 0.1 }}>
                          {Array.from({ length: 3 }, (_, j) => (
                            <div key={j} style={{
                              height: 6, marginBottom: 5,
                              background: 'rgba(255,255,255,0.5)',
                              width: `${70 + Math.random() * 30}%`,
                              borderRadius: 1,
                            }} />
                          ))}
                        </div>
                      )}
                      {sec.format === 'kpi-cards' && (
                        <div style={{ display: 'flex', gap: 8, opacity: 0.12 }}>
                          {Array.from({ length: 4 }, (_, j) => (
                            <div key={j} style={{
                              flex: 1, height: 28,
                              background: 'rgba(255,255,255,0.3)',
                              borderRadius: 2,
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Heatmap canvas overlay */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            opacity: 0.75,
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* Color legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {[
          { label: 'High focus', color: '#EF4444' },
          { label: 'Medium', color: '#F5C518' },
          { label: 'Low', color: '#0FC9A0' },
          { label: 'Glanced', color: '#3D8EFF' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <AppShell>
      <div className="max-w-[600px] mx-auto py-20 text-center">
        <svg viewBox="0 0 32 32" fill="none" width="48" height="48" className="mx-auto mb-6">
          <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="var(--text3)" strokeWidth="1.4" fill="none" opacity=".5"/>
          <circle cx="16" cy="16" r="5" stroke="var(--text3)" strokeWidth="1.4" fill="none" opacity=".5"/>
          <circle cx="16" cy="16" r="2" fill="var(--text3)" opacity=".5"/>
        </svg>
        <h1 className="font-serif text-[24px] mb-3" style={{ color: 'var(--text)' }}>No Review Data Yet</h1>
        <p className="text-[13px] mb-8 max-w-sm mx-auto" style={{ color: 'var(--text2)' }}>
          Complete a study review session with gaze tracking enabled to see your attention report.
        </p>
        <a
          href="/studies"
          className="inline-block font-mono text-[12px] tracking-[0.08em] uppercase px-6 py-3 text-white"
          style={{ background: 'var(--navy)', border: 'none', textDecoration: 'none' }}
        >
          Start a Review &rarr;
        </a>
      </div>
    </AppShell>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────────────────────── */

export default function AttentionReport() {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [scores, setScores] = useState<StyleScores | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [heatmapSessionIdx, setHeatmapSessionIdx] = useState<number | null>(null);

  useEffect(() => {
    setSessions(loadSessions());
    const prior = loadPrior();
    setSessionCount(prior.sessionCount);
    if (prior.sessionCount > 0) {
      setScores(posteriorMean(prior));
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;
  if (sessions.length === 0) return <EmptyState />;

  // Aggregate data across all sessions
  const totalDurationMs = sessions.reduce((s, r) => s + r.durationMs, 0);
  const allInterventions = sessions.flatMap(r => r.interventionsFired);
  const uniqueInterventions = Array.from(new Set(allInterventions));

  // Aggregate dwell per section across all sessions
  const dwellMap = new Map<string, { label: string; dwellMs: number }>();
  for (const session of sessions) {
    for (const sec of session.sections) {
      const existing = dwellMap.get(sec.id);
      if (existing) {
        existing.dwellMs += sec.dwellMs;
      } else {
        dwellMap.set(sec.id, { label: sec.label, dwellMs: sec.dwellMs });
      }
    }
  }
  const dwellSections = Array.from(dwellMap.values()).sort((a, b) => b.dwellMs - a.dwellMs);
  const maxDwell = dwellSections.length > 0 ? Math.max(...dwellSections.map(d => d.dwellMs)) : 1;
  const totalSectionDwell = dwellSections.reduce((s, d) => s + d.dwellMs, 0);

  // Flag sections with low dwell (< 10% of max)
  const LOW_DWELL_THRESHOLD = maxDwell * 0.15;

  // Cognitive profile
  const vizPct = scores ? Math.round(scores.visualizer * 100) : 33;
  const verbPct = scores ? Math.round(scores.verbalizer * 100) : 33;
  const spatPct = scores ? Math.round(scores.spatial * 100) : 34;

  // Coverage: % of sections that got meaningful dwell (>2s total)
  const coveredSections = dwellSections.filter(d => d.dwellMs > 2000).length;
  const coveragePct = dwellSections.length > 0 ? Math.round((coveredSections / dwellSections.length) * 100) : 0;

  // Generate next-session bullets from real adaptation config
  const nextBullets: string[] = [];
  if (scores) {
    const config = buildAdaptationConfig(scores);
    if (config.layoutMode === 'visualizer') {
      nextBullets.push('Prioritize chart-based data encodings over prose narratives');
    } else if (config.layoutMode === 'verbalizer') {
      nextBullets.push('Lead with clinical narratives and detailed AE tables');
    } else {
      nextBullets.push('Emphasize spatial layouts and heatmap-style data views');
    }
  }
  // Add bullets based on intervention history
  if (uniqueInterventions.length > 0) {
    nextBullets.push(`Surface ${uniqueInterventions.length === 1 ? 'the' : ''} low-dwell alert${uniqueInterventions.length > 1 ? 's' : ''} earlier for: ${uniqueInterventions.join(', ')}`);
  }
  // Add bullet for low-dwell sections
  const lowDwellSections = dwellSections.filter(d => d.dwellMs < LOW_DWELL_THRESHOLD && d.dwellMs > 0);
  if (lowDwellSections.length > 0) {
    nextBullets.push(`Increase visual emphasis on ${lowDwellSections.map(d => d.label).join(', ')}`);
  }
  if (nextBullets.length === 0) {
    nextBullets.push('Continue tracking to refine your cognitive profile across more sessions');
  }

  return (
    <AppShell>
      <div className="max-w-[960px] mx-auto space-y-8">

        {/* ── SECTION 1: SESSION SUMMARY ─────────────────────────────── */}
        <section>
          <SectionHeader>Session Summary</SectionHeader>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Sessions', value: String(sessions.length), bar: 'stat-bar-blue' },
              { label: 'Total Review Time', value: fmtMs(totalDurationMs), bar: 'stat-bar-teal' },
              { label: 'Data Coverage', value: `${coveragePct}%`, bar: 'stat-bar-amber' },
              { label: 'Alerts Triggered', value: String(allInterventions.length), bar: 'stat-bar-red' },
            ].map((card) => (
              <div
                key={card.label}
                className={`relative ${card.bar}`}
                style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: '16px' }}
              >
                <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-2" style={{ color: 'var(--text3)' }}>
                  {card.label}
                </div>
                <div className="font-serif text-[28px] leading-none" style={{ color: 'var(--text)' }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 2: COGNITIVE PROFILE ────────────────────────────── */}
        <section>
          <SectionHeader>Cognitive Profile</SectionHeader>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: 24 }}>
            <div className="font-mono text-[11px] tracking-[0.06em] uppercase mb-5" style={{ color: 'var(--text2)' }}>
              Your Profile &middot; {sessionCount} session{sessionCount !== 1 ? 's' : ''} accumulated
              {scores && scores.confidence >= 0.5 && (
                <span className="ml-3 text-[10px]" style={{ color: 'var(--teal)' }}>High confidence</span>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {[
                { label: 'Visualizer', pct: vizPct, color: 'var(--accent)' },
                { label: 'Verbalizer', pct: verbPct, color: 'var(--teal)' },
                { label: 'Spatial', pct: spatPct, color: 'var(--amber)' },
              ].map(bar => (
                <div key={bar.label} className="flex items-center gap-3">
                  <span className="font-mono text-[12px] w-[90px] shrink-0" style={{ color: 'var(--text2)' }}>
                    {bar.label}
                  </span>
                  <div className="flex-1 h-[14px] relative" style={{ background: 'var(--surface)' }}>
                    <div className="absolute left-0 top-0 bottom-0" style={{ width: `${bar.pct}%`, background: bar.color }} />
                  </div>
                  <span className="font-mono text-[12px] w-[38px] text-right shrink-0" style={{ color: 'var(--text)' }}>
                    {bar.pct}%
                  </span>
                </div>
              ))}
            </div>

            {scores && (
              <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text2)' }}>
                Dominant style: <strong style={{ color: scores.dominant === 'visualizer' ? 'var(--accent)' : scores.dominant === 'verbalizer' ? 'var(--teal)' : 'var(--amber)' }}>
                  {scores.dominant.charAt(0).toUpperCase() + scores.dominant.slice(1)}
                </strong>
                {scores.confidence < 0.5 ? ' — more sessions needed for confident classification' : ' — profile converged'}
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 3: DWELL TIME BY SECTION ───────────────────────── */}
        {dwellSections.length > 0 && (
          <section>
            <SectionHeader>Dwell Time by Section (Cumulative)</SectionHeader>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: 24 }}>
              <div className="space-y-2">
                {dwellSections.map((d) => {
                  const isLow = d.dwellMs < LOW_DWELL_THRESHOLD && d.dwellMs > 0;
                  const barPct = maxDwell > 0 ? (d.dwellMs / maxDwell) * 100 : 0;
                  const dwellPct = totalSectionDwell > 0 ? Math.round((d.dwellMs / totalSectionDwell) * 100) : 0;
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="font-mono text-[11px] w-[180px] shrink-0 truncate" style={{ color: 'var(--text2)' }}>
                        {d.label}
                      </span>
                      <div className="flex-1 h-[20px] relative" style={{ background: 'var(--surface)' }}>
                        <div
                          className="absolute left-0 top-0 bottom-0"
                          style={{ width: `${barPct}%`, background: isLow ? 'var(--red)' : 'var(--teal)', opacity: 0.85 }}
                        />
                      </div>
                      <span className="font-mono text-[11px] w-[50px] text-right shrink-0 tabular-nums" style={{ color: isLow ? 'var(--red)' : 'var(--teal)' }}>
                        {fmtMs(d.dwellMs)}
                      </span>
                      <span className="font-mono text-[10px] w-[32px] text-right shrink-0 tabular-nums" style={{ color: 'var(--text3)' }}>
                        {dwellPct}%
                      </span>
                      {isLow && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 shrink-0" style={{ background: 'rgba(224,60,60,0.1)', color: 'var(--red)', border: '1px solid rgba(224,60,60,0.2)' }}>
                          LOW
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── SECTION 4: SESSION HISTORY ────────────────────────────── */}
        {sessions.length > 1 && (
          <section>
            <SectionHeader>Session History</SectionHeader>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-[1fr_80px_80px_100px] px-4 py-2" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: 'var(--text3)' }}>Date</span>
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-right" style={{ color: 'var(--text3)' }}>Duration</span>
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-right" style={{ color: 'var(--text3)' }}>Sections</span>
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-right" style={{ color: 'var(--text3)' }}>Alerts</span>
              </div>
              {sessions.slice().reverse().map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_100px] px-4 py-2.5" style={{ borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text2)' }}>{fmtDate(s.timestamp)}</span>
                  <span className="font-mono text-[11px] text-right tabular-nums" style={{ color: 'var(--text2)' }}>{fmtMs(s.durationMs)}</span>
                  <span className="font-mono text-[11px] text-right tabular-nums" style={{ color: 'var(--text2)' }}>{s.sections.length}</span>
                  <span className="font-mono text-[11px] text-right tabular-nums" style={{ color: s.interventionsFired.length > 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {s.interventionsFired.length > 0 ? s.interventionsFired.length : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── SECTION 5: GAZE HEATMAP ─────────────────────────────── */}
        {sessions.some(s => s.gazePoints && s.gazePoints.length > 0) && (
          <section>
            <SectionHeader>Attention Heatmap &mdash; Researcher Export</SectionHeader>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>View:</span>
                <button
                  onClick={() => setHeatmapSessionIdx(null)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 10px', cursor: 'pointer',
                    background: heatmapSessionIdx === null ? 'rgba(61,142,255,0.1)' : 'var(--surface)',
                    color: heatmapSessionIdx === null ? 'var(--accent)' : 'var(--text3)',
                    border: `1px solid ${heatmapSessionIdx === null ? 'rgba(61,142,255,0.3)' : 'var(--border)'}`,
                  }}
                >
                  All Sessions
                </button>
                {sessions.map((s, i) => (
                  s.gazePoints && s.gazePoints.length > 0 && (
                    <button
                      key={i}
                      onClick={() => setHeatmapSessionIdx(i)}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 10px', cursor: 'pointer',
                        background: heatmapSessionIdx === i ? 'rgba(61,142,255,0.1)' : 'var(--surface)',
                        color: heatmapSessionIdx === i ? 'var(--accent)' : 'var(--text3)',
                        border: `1px solid ${heatmapSessionIdx === i ? 'rgba(61,142,255,0.3)' : 'var(--border)'}`,
                      }}
                    >
                      Session {i + 1}
                    </button>
                  )
                ))}
              </div>
              <GazeReplayHeatmap sessions={sessions} selectedIdx={heatmapSessionIdx} />
              <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
                Heatmap shows gaze density overlaid on the document layout. Warmer colors indicate areas that received more reviewer focus.
              </p>
            </div>
          </section>
        )}

        {/* ── SECTION 6: NEXT SESSION ────────────────────────────────── */}
        <section>
          <SectionHeader>Next Session</SectionHeader>
          <div style={{ background: 'var(--navy)', border: '1px solid var(--navy)', padding: 28 }}>
            <div className="font-mono text-[11px] tracking-[0.06em] uppercase mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Your Next Review Will:
            </div>
            <ul className="space-y-2 mb-6">
              {nextBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="inline-block w-[5px] h-[5px] mt-[6px] shrink-0" style={{ background: 'var(--accent)' }} />
                  <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {b}
                  </span>
                </li>
              ))}
            </ul>
            <a
              href="/studies"
              className="inline-block font-mono text-[11px] tracking-[0.08em] uppercase px-5 py-3"
              style={{ background: 'var(--white)', color: 'var(--navy)', textDecoration: 'none' }}
            >
              Begin Next Review &rarr;
            </a>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
