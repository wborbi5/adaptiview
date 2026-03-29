'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGaze } from '@/lib/use-gaze';
import { detectFixations, extractSaccades, computeCoefficientK, type GazeSample } from '@/lib/ivt-fixation';
import { classifyStyle, applyTemporalWeighting, type StyleScores } from '@/lib/style-classifier';
import { computeGazeTransitionEntropy } from '@/lib/scan-entropy';
import { computeDispersion, normalizeBCEA, normalizeAspectRatio } from '@/lib/fixation-dispersion';
import { detectReadingBehavior } from '@/lib/reading-detection';
import { loadPrior, savePrior, updatePosterior, posteriorMean, type DirichletState } from '@/lib/bayesian-accumulator';
import { AOIManager } from '@/lib/aoi-manager';
import { mockDB } from '@/lib/mock-db';
import { SOC_DATA } from '@/lib/clinical-data';
import { Calibration } from '@/lib/calibration';

const SESSION_DURATION = 60;
const ROUND_DURATION = 30; // seconds per content round

// ─── 2 rounds of rich content per panel ───

const CHART_ROUNDS = [
  {
    bar: { title: 'Progression-Free Survival (months)', bars: [
      { x: 20, h: 120, c: '#3B82F6', l: 'Arm A' }, { x: 55, h: 100, c: '#60A5FA', l: 'Arm B' },
      { x: 90, h: 135, c: '#2563EB', l: 'Combo' }, { x: 125, h: 88, c: '#93C5FD', l: '200mg' },
      { x: 160, h: 110, c: '#3B82F6', l: '400mg' }, { x: 195, h: 65, c: '#1D4ED8', l: 'Placebo' },
      { x: 230, h: 125, c: '#60A5FA', l: 'Cross' },
    ]},
    scatter: { title: 'Dose-Response (mg vs %Response)', points: [
      [25,135],[40,120],[55,105],[70,95],[85,110],[100,80],[115,70],[130,60],[145,85],[160,55],[175,45],[190,65],[205,40],[220,50],[235,35],
    ]},
    pie: { title: 'Response Categories', slices: [
      { pct: 35, c: '#22C55E', l: 'CR' }, { pct: 28, c: '#3B82F6', l: 'PR' },
      { pct: 22, c: '#F59E0B', l: 'SD' }, { pct: 15, c: '#EF4444', l: 'PD' },
    ]},
    table: [
      ['Endpoint', 'Drug', 'Control', 'HR', 'p-value'],
      ['mPFS', '18.9mo', '9.2mo', '0.43', '<0.001'],
      ['mOS', '38.6mo', '31.8mo', '0.79', '0.044'],
      ['ORR', '74%', '31%', '—', '<0.001'],
      ['DOR', '17.2mo', '8.3mo', '—', '0.002'],
    ],
  },
  {
    bar: { title: 'Adverse Events by System Organ Class', bars: [
      { x: 20, h: 130, c: '#EF4444', l: 'GI' }, { x: 55, h: 95, c: '#F59E0B', l: 'Derm' },
      { x: 90, h: 75, c: '#8B5CF6', l: 'Hepat' }, { x: 125, h: 110, c: '#EC4899', l: 'Fatigue' },
      { x: 160, h: 50, c: '#22C55E', l: 'Neuro' }, { x: 195, h: 40, c: '#06B6D4', l: 'Cardiac' },
      { x: 230, h: 85, c: '#F97316', l: 'Heme' },
    ]},
    scatter: { title: 'Kaplan-Meier Overall Survival (months)', points: [
      [25,25],[40,27],[55,30],[70,35],[85,42],[100,50],[115,58],[130,68],[145,75],[160,85],[175,92],[190,100],[205,110],[220,118],[235,128],
    ]},
    pie: { title: 'Discontinuation Reasons', slices: [
      { pct: 42, c: '#EF4444', l: 'AE' }, { pct: 31, c: '#F59E0B', l: 'PD' },
      { pct: 18, c: '#8B5CF6', l: 'Withdraw' }, { pct: 9, c: '#6B7280', l: 'Other' },
    ]},
    table: [
      ['AE Grade', 'Drug (n=624)', 'Control (n=623)', 'Risk Diff'],
      ['Grade 1-2', '67%', '52%', '+15%'],
      ['Grade 3', '24%', '14%', '+10%'],
      ['Grade 4', '7%', '4%', '+3%'],
      ['Grade 5', '1.2%', '0.8%', '+0.4%'],
    ],
  },
];

const TEXT_ROUNDS = [
  [
    'STUDY DESIGN: The CROWN-7 trial was a multicenter, double-blind, placebo-controlled Phase III study enrolling 1,247 patients with locally advanced or metastatic non-small cell lung cancer (NSCLC) harboring EGFR exon 19 deletions or L858R point mutations. Randomization was stratified by ECOG performance status (0 vs 1), CNS metastases (yes vs no), and line of therapy.',
    'PRIMARY ENDPOINT: Investigator-assessed progression-free survival demonstrated statistically significant and clinically meaningful improvement in the experimental arm (median PFS 18.9 months vs 9.2 months; HR 0.43; 95% CI 0.35-0.54; two-sided p<0.0001). The Kaplan-Meier curves separated early and maintained divergence through 36-month follow-up.',
    'SECONDARY ENDPOINTS: Confirmed objective response rate was 74% (95% CI 70.1-77.9) in the experimental arm versus 31% (95% CI 27.0-35.2) in the control arm. Median duration of response was 17.2 months vs 8.3 months. Disease control rate reached 93% vs 74%. Intracranial response rate was 68% in patients with measurable CNS disease at baseline.',
    'SAFETY: Grade 3+ treatment-related adverse events occurred in 31% of patients receiving the study drug versus 18% with standard of care. The most common Grade 3+ events were diarrhea (8.2%), rash (5.1%), and elevated ALT (4.7%). Treatment discontinuation due to AEs occurred in 12% vs 7%. There were no unexpected safety signals. Patient-reported outcomes using EORTC QLQ-C30 showed maintained quality of life with no significant deterioration in global health status.',
    'SUBGROUP ANALYSIS: Consistent benefit was observed across all pre-specified subgroups including age (<65 vs ≥65), sex, race, smoking history, ECOG status, presence of CNS metastases, and prior therapy lines. The strongest PFS benefit was observed in patients with exon 19 deletions (HR 0.37) compared to L858R mutations (HR 0.51). An exploratory ctDNA analysis showed molecular response at Week 6 was predictive of long-term PFS benefit.',
  ],
  [
    'BACKGROUND: Anti-PD-L1 combination immunotherapy has shown variable efficacy across solid tumor types. The BEACON-5 basket trial was designed to simultaneously evaluate a novel PD-L1/CTLA-4 bispecific antibody combined with platinum-based chemotherapy across 5 tumor-agnostic cohorts (breast, gastric, urothelial, head and neck, and cervical cancers), with enrollment restricted to PD-L1 CPS ≥10.',
    'EFFICACY BY COHORT: The breast cancer cohort demonstrated the strongest signal with ORR 48.2% (95% CI 38.7-57.8), median DOR 14.3 months, and median PFS 9.8 months. The gastric cohort achieved ORR 33.1% with a notable complete response rate of 8.4%. The urothelial cohort showed ORR 41.7% with durable responses. Head and neck cancers had ORR 37.2% but shorter duration. Cervical cancer showed modest ORR of 26.3% but included 3 complete responses in heavily pretreated patients.',
    'BIOMARKER ANALYSIS: TMB-high patients (≥10 mutations/Mb) had significantly improved outcomes across all cohorts (ORR 58% vs 29%, p<0.001). PD-L1 CPS ≥50 further enriched for responders (ORR 63% vs 34%). Gene expression profiling identified a T-cell-inflamed signature that was independently predictive. Patients with both TMB-high and T-cell-inflamed tumors achieved ORR of 72% with median DOR not yet reached. Microsatellite instability high (MSI-H) patients showed ORR of 61% regardless of tumor type.',
    'SAFETY AND TOLERABILITY: Immune-related adverse events of any grade occurred in 67% of patients, with Grade 3+ irAEs in 18.9%. Pneumonitis requiring intervention occurred in 4.2%, hepatitis in 3.1%, colitis in 2.8%, and endocrinopathies in 8.4% (predominantly thyroid dysfunction). Combination-specific toxicity of infusion-related myalgia was observed in 11%. Overall treatment discontinuation rate due to AEs was 14.2%. There were 4 treatment-related deaths (0.4%): 2 pneumonitis, 1 myocarditis, 1 hepatic failure.',
    'CONCLUSIONS: The BEACON-5 trial supports a tumor-agnostic approach to PD-L1/CTLA-4 bispecific therapy in PD-L1-high tumors. The composite biomarker strategy combining TMB and gene expression profiling identifies a super-responder population with ORR >70%. Regulatory submissions for tumor-agnostic approval in TMB-high/PD-L1-high solid tumors are planned. An expansion cohort evaluating the combination in first-line NSCLC is enrolling.',
  ],
];

const SPATIAL_ROUNDS = [
  {
    type: 'enrollment' as const,
    label: 'Site Enrollment by Region',
    regions: [
      { region: 'North America', sites: 18, enrolled: 247, target: 320, countries: ['USA (12)', 'Canada (6)'] },
      { region: 'Western Europe', sites: 14, enrolled: 198, target: 240, countries: ['Germany (5)', 'France (4)', 'UK (3)', 'Spain (2)'] },
      { region: 'Asia-Pacific', sites: 10, enrolled: 132, target: 160, countries: ['Japan (4)', 'South Korea (3)', 'Australia (3)'] },
      { region: 'Rest of World', sites: 5, enrolled: 47, target: 80, countries: ['Brazil (3)', 'Israel (2)'] },
    ],
  },
  {
    type: 'heatmap' as const,
    label: 'Adverse Events: SOC × Grade Heatmap',
    // Uses SOC_DATA from clinical-data.ts — rendered inline
  },
];

export default function OnboardPage() {
  const [stage, setStage] = useState<'waiting' | 'calibrating' | 'ready' | 'running' | 'done'>('waiting');
  const [faceReady, setFaceReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<StyleScores | null>(null);
  const [multiSessionResult, setMultiSessionResult] = useState<StyleScores | null>(null);
  const [bayesianState, setBayesianState] = useState<DirichletState | null>(null);
  const [features, setFeatures] = useState<number[] | null>(null);
  const [, setGate5] = useState(false);
  const [liveSamples, setLiveSamples] = useState(0);
  const [gazePos, setGazePos] = useState<{ x: number; y: number } | null>(null);
  const [liveDwell, setLiveDwell] = useState<Record<string, number>>({ charts: 0, text: 0, spatial: 0 });
  const [round, setRound] = useState(0);

  // Refs for AOI panels
  const chartsRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const spatialRef = useRef<HTMLDivElement>(null);

  const samplesRef = useRef<GazeSample[]>([]);
  const allSamplesRef = useRef<GazeSample[]>([]);
  const visitSeqRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aoiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const aoiManagerRef = useRef<AOIManager | null>(null);
  const totalSampleCountRef = useRef(0);
  const lastSampleTimeRef = useRef(0);
  // Per-AOI dwell accumulation from raw gaze samples
  const dwellAccumRef = useRef<Record<string, number>>({ charts: 0, text: 0, spatial: 0 });

  const onSample = useCallback((sample: GazeSample) => {
    samplesRef.current.push(sample);
    allSamplesRef.current.push(sample);
    setGazePos({ x: sample.x, y: sample.y });

    // Estimate time delta from timestamps
    const timeDelta = lastSampleTimeRef.current > 0 ? sample.t - lastSampleTimeRef.current : 33;
    const clampedDelta = Math.min(Math.max(timeDelta, 10), 200);
    lastSampleTimeRef.current = sample.t;
    totalSampleCountRef.current++;

    // Hit-test gaze against AOI panels
    const mgr = aoiManagerRef.current;
    if (mgr) {
      const hitAoi = mgr.hitTest(sample.x, sample.y);
      if (hitAoi) {
        dwellAccumRef.current[hitAoi] += clampedDelta;
        visitSeqRef.current.push(hitAoi);
      }
    }

    if (samplesRef.current.length > 500) {
      samplesRef.current = samplesRef.current.slice(-300);
    }
  }, []);

  const { mode, diagnostics } = useGaze({ onSample });
  const diagRef = useRef(diagnostics);
  useEffect(() => { diagRef.current = diagnostics; }, [diagnostics]);

  // Face readiness
  useEffect(() => {
    if (faceReady) return;
    const interval = setInterval(() => {
      if (diagRef.current.totalNulls > 10) {
        setFaceReady(true);
        setStage('calibrating');
        clearInterval(interval);
      }
    }, 500);
    const timeout = setTimeout(() => {
      if (!faceReady) {
        setFaceReady(true);
        setStage('calibrating');
        clearInterval(interval);
      }
    }, 15000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [faceReady]);

  const handleCalibComplete = () => {
    setStage('ready');
  };

  const startSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (aoiIntervalRef.current) clearInterval(aoiIntervalRef.current);
    setStage('running');
    setElapsed(0);
    setLiveSamples(0);
    startTimeRef.current = Date.now();
    samplesRef.current = [];
    allSamplesRef.current = [];
    visitSeqRef.current = [];
    dwellAccumRef.current = { charts: 0, text: 0, spatial: 0 };
    totalSampleCountRef.current = 0;
    lastSampleTimeRef.current = 0;
    aoiManagerRef.current = null;

    // Main timer
    setRound(0);
    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(sec);
      setLiveSamples(totalSampleCountRef.current);
      setLiveDwell({ ...dwellAccumRef.current });
      setRound(Math.min(1, Math.floor(sec / ROUND_DURATION)));
      if (sec >= SESSION_DURATION) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (aoiIntervalRef.current) clearInterval(aoiIntervalRef.current);
        computeResults();
      }
    }, 200);

    // AOI rect updater — keeps bounding boxes fresh
    aoiIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      if (chartsRef.current && textRef.current && spatialRef.current) {
        const aois = [
          { id: 'charts', label: 'Charts', rect: chartsRef.current.getBoundingClientRect() },
          { id: 'text', label: 'Text', rect: textRef.current.getBoundingClientRect() },
          { id: 'spatial', label: 'Spatial', rect: spatialRef.current.getBoundingClientRect() },
        ];
        if (!aoiManagerRef.current) {
          aoiManagerRef.current = new AOIManager(aois);
        } else {
          aoiManagerRef.current.updateRects(aois);
        }
      }
    }, 500);
  };

  const computeResults = () => {
    if (!mountedRef.current) return;
    const accum = dwellAccumRef.current;
    const totalDwell = accum.charts + accum.text + accum.spatial;

    // Discard first 8 seconds of samples (orienting response noise)
    const ORIENTING_MS = 8000;
    const sessionStart = startTimeRef.current;
    const stableSamples = allSamplesRef.current.filter(s => s.t > sessionStart + ORIENTING_MS);

    const allFixations = detectFixations(stableSamples);
    const saccades = extractSaccades(allFixations);

    // Record fixations into AOI manager
    const mgr = aoiManagerRef.current;
    if (mgr) {
      for (const f of allFixations) mgr.recordFixation(f.x, f.y, f.duration);
    }

    const textDwell = totalDwell > 0 ? accum.text / totalDwell : 0.33;
    const chartDwell = totalDwell > 0 ? accum.charts / totalDwell : 0.33;
    const spatialDwell = totalDwell > 0 ? accum.spatial / totalDwell : 0.33;

    // Gaze Transition Entropy (first-order Markov)
    const gte = computeGazeTransitionEntropy(visitSeqRef.current);

    // Avg fixation duration normalized: 150ms=0, 600ms=1
    const avgFixDuration = allFixations.length > 0
      ? allFixations.reduce((s, f) => s + f.duration, 0) / allFixations.length : 300;
    const avgFixNorm = Math.min(1, Math.max(0, (avgFixDuration - 150) / 450));

    // Transition rate: AOI switches per second, normalized
    const visitSeq = visitSeqRef.current;
    let transitions = 0;
    for (let i = 1; i < visitSeq.length; i++) {
      if (visitSeq[i] !== visitSeq[i - 1]) transitions++;
    }
    const sessionSec = (Date.now() - startTimeRef.current) / 1000;
    const transitionRate = Math.min(1, (transitions / Math.max(1, sessionSec)) / 2);

    // Focus ratio
    const maxDwell = Math.max(accum.charts, accum.text, accum.spatial);
    const focusRatio = totalDwell > 0 ? maxDwell / totalDwell : 0.33;

    // Mean saccade amplitude
    const meanSaccAmp = saccades.length > 0
      ? saccades.reduce((s, sc) => s + sc.amplitude, 0) / saccades.length : 200;
    const saccAmpNorm = Math.min(1, Math.max(0, meanSaccAmp / 500));

    // Coefficient K
    const rawK = computeCoefficientK(allFixations, saccades);
    const kNorm = Math.min(1, Math.max(0, (rawK + 2) / 4));

    // Dwell drift between halves
    const halfTime = sessionStart + (SESSION_DURATION * 500);
    const firstHalfSeq = visitSeqRef.current.filter((_, i) => {
      const approxTime = sessionStart + (i / visitSeqRef.current.length) * SESSION_DURATION * 1000;
      return approxTime < halfTime;
    });
    const secondHalfSeq = visitSeqRef.current.filter((_, i) => {
      const approxTime = sessionStart + (i / visitSeqRef.current.length) * SESSION_DURATION * 1000;
      return approxTime >= halfTime;
    });
    const countDominant = (seq: string[]) => {
      const c: Record<string, number> = {};
      seq.forEach(s => c[s] = (c[s] || 0) + 1);
      const total = seq.length || 1;
      const max = Math.max(...Object.values(c), 0);
      return max / total;
    };
    const dwellDrift = Math.abs(countDominant(secondHalfSeq) - countDominant(firstHalfSeq));

    // ─── NEW: Within-AOI fixation dispersion (BCEA + aspect ratio) ───
    const dispersion = computeDispersion(allFixations);
    const bceaNorm = normalizeBCEA(dispersion.bcea);
    const arNorm = normalizeAspectRatio(dispersion.aspectRatio);

    // ─── NEW: Reading detection ───
    const reading = detectReadingBehavior(allFixations);

    // ─── NEW: Temporal weighting (30% early / 70% late) ───
    // Split fixations at session midpoint for early vs late features
    const midTime = sessionStart + ORIENTING_MS + ((SESSION_DURATION * 1000 - ORIENTING_MS) / 2);
    const earlyFixations = allFixations.filter(f => f.startTime < midTime);
    const lateFixations = allFixations.filter(f => f.startTime >= midTime);

    const computePartialFeatures = (fixations: typeof allFixations) => {
      const avgFD = fixations.length > 0
        ? fixations.reduce((s, f) => s + f.duration, 0) / fixations.length : 300;
      const sacc = extractSaccades(fixations);
      const mSacc = sacc.length > 0 ? sacc.reduce((s, sc) => s + sc.amplitude, 0) / sacc.length : 200;
      const k = computeCoefficientK(fixations, sacc);
      const disp = computeDispersion(fixations);
      const rd = detectReadingBehavior(fixations);
      return [
        textDwell, chartDwell, spatialDwell, gte,
        Math.min(1, Math.max(0, (avgFD - 150) / 450)),
        transitionRate, focusRatio,
        Math.min(1, Math.max(0, mSacc / 500)),
        Math.min(1, Math.max(0, (k + 2) / 4)),
        dwellDrift,
        normalizeBCEA(disp.bcea),
        normalizeAspectRatio(disp.aspectRatio),
        rd.readingScore,
      ];
    };

    let featureVector: number[];
    if (earlyFixations.length >= 5 && lateFixations.length >= 5) {
      const earlyFeats = computePartialFeatures(earlyFixations);
      const lateFeats = computePartialFeatures(lateFixations);
      featureVector = applyTemporalWeighting(earlyFeats, lateFeats, 0.3, 0.7);
    } else {
      featureVector = [
        textDwell, chartDwell, spatialDwell, gte, avgFixNorm, transitionRate, focusRatio,
        saccAmpNorm, kNorm, dwellDrift, bceaNorm, arNorm, reading.readingScore,
      ];
    }


    setFeatures(featureVector);
    const scores = classifyStyle(featureVector);
    setResult(scores);

    // ─── NEW: Bayesian multi-session accumulation ───
    const prior = loadPrior();

    // Only accumulate if session wasn't rejected
    if (!scores.rejected) {
      const posterior = updatePosterior(prior, scores);
      savePrior(posterior);
      setBayesianState(posterior);
      const multiResult = posteriorMean(posterior);
      setMultiSessionResult(multiResult);
    } else {
      setBayesianState(prior);
      if (prior.sessionCount > 0) {
        setMultiSessionResult(posteriorMean(prior));
      }
    }

    if (scores.confidence > 0) setGate5(true);
    mockDB.upsertProfile({
      id: 'tester-001',
      style_scores: { visualizer: scores.visualizer, verbalizer: scores.verbalizer, spatial: scores.spatial },
      raw_features: featureVector,
      session_count: (prior.sessionCount || 0) + 1,
    });
    mockDB.insertSession({
      user_id: 'tester-001',
      aoi_dwell_times: { charts: chartDwell, text: textDwell, spatial: spatialDwell },
      dominant_style: scores.dominant,
      confidence: scores.confidence,
      timestamp: Date.now(),
    });
    setStage('done');
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (aoiIntervalRef.current) clearInterval(aoiIntervalRef.current);
    };
  }, []);

  // Helper: format dwell ms as seconds
  const fmtDwell = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const totalLiveDwell = liveDwell.charts + liveDwell.text + liveDwell.spatial;
  const dwellPct = (aoi: string) => totalLiveDwell > 0 ? Math.round((liveDwell[aoi] / totalLiveDwell) * 100) : 0;

  // ─── WAITING / CALIBRATING ───
  if (stage === 'waiting' || stage === 'calibrating') {
    return (
      <main className="min-h-screen relative overflow-hidden" style={{ background: 'var(--surface)' }}>
        {stage === 'waiting' && (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center max-w-sm p-8" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
              <div className="w-12 h-12 mx-auto mb-6" style={{ border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <h1 className="font-serif text-[22px] mb-2" style={{ color: 'var(--text)' }}>Initializing Eye Tracking</h1>
              <p className="text-[13px] mb-6" style={{ color: 'var(--text2)' }}>Setting up camera and gaze pipeline...</p>
              <div className="flex gap-2 justify-center">
                {[
                  { label: 'Camera', ok: diagnostics.cameraStream },
                  { label: 'Face', ok: faceReady },
                ].map(({ label, ok }) => (
                  <span key={label} className="font-mono text-[10px] px-3 py-1.5 tracking-[0.06em] uppercase" style={{
                    background: ok ? 'rgba(15,201,160,0.1)' : 'var(--surface2)',
                    color: ok ? '#0AA880' : 'var(--text3)',
                    border: `1px solid ${ok ? 'rgba(15,201,160,0.25)' : 'var(--border)'}`,
                    borderRadius: '2px',
                  }}>
                    {label} {ok ? '\u2713' : '\u2022\u2022\u2022'}
                  </span>
                ))}
              </div>
              <p className="font-mono text-[10px] mt-6" style={{ color: 'var(--text3)' }}>Ensure your face is visible to the webcam</p>
            </div>
          </div>
        )}

        {stage === 'calibrating' && (
          <Calibration faceReady={faceReady} onComplete={handleCalibComplete} gazePos={gazePos} />
        )}
      </main>
    );
  }

  // ─── READY ───
  if (stage === 'ready') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--surface)' }}>
        <div className="text-center max-w-md p-10" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center" style={{ background: 'rgba(61,142,255,0.08)', border: '1px solid rgba(61,142,255,0.2)' }}>
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
              <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="#3D8EFF" strokeWidth="1.4" fill="none" opacity=".85"/>
              <circle cx="16" cy="16" r="5" stroke="#3D8EFF" strokeWidth="1.4" fill="none"/>
              <circle cx="16" cy="16" r="2" fill="#3D8EFF"/>
            </svg>
          </div>
          <h1 className="font-serif text-[28px] mb-2" style={{ color: 'var(--text)' }}>Ready to Begin</h1>
          <p className="text-[13px] mb-1" style={{ color: 'var(--text2)' }}>60-second session with all 3 content types displayed simultaneously.</p>
          <p className="text-[12px] mb-8" style={{ color: 'var(--text3)' }}>Look naturally at whatever interests you. We track which panel draws your gaze.</p>
          <button onClick={startSession}
            className="font-mono text-[12.5px] font-medium tracking-[0.1em] uppercase text-white cursor-pointer"
            style={{ height: 48, padding: '0 32px', background: 'var(--navy)', border: 'none', borderRadius: 0 }}>
            Start Session &rarr;
          </button>
          <div className="mt-5 font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
            Mode: {mode} &middot; Valid frames: {diagnostics.totalValid}
          </div>
        </div>
      </main>
    );
  }

  // ─── RUNNING — All 3 panels visible simultaneously ───
  if (stage === 'running') {
    return (
      <main className="min-h-screen p-5 relative" style={{ background: 'var(--surface)' }}>
        {/* Header */}
        <div className="mb-5 p-4" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-4 mb-3">
            <svg viewBox="0 0 32 32" fill="none" width="20" height="20">
              <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="#3D8EFF" strokeWidth="1.4" fill="none" opacity=".85"/>
              <circle cx="16" cy="16" r="2" fill="#3D8EFF"/>
            </svg>
            <h1 className="font-serif text-[18px]" style={{ color: 'var(--text)' }}>Style Classification</h1>
            <span className="font-mono text-[10px] px-2.5 py-1 tracking-[0.06em]" style={{
              background: liveSamples > 0 ? 'rgba(15,201,160,0.1)' : 'var(--surface2)',
              color: liveSamples > 0 ? '#0AA880' : 'var(--text3)',
              border: `1px solid ${liveSamples > 0 ? 'rgba(15,201,160,0.25)' : 'var(--border)'}`,
              borderRadius: '2px',
            }}>
              {liveSamples > 0 ? `${liveSamples} samples` : 'awaiting data...'}
            </span>
            <div className="flex-1" />
            <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--text2)' }}>
              {Math.max(0, SESSION_DURATION - elapsed)}s remaining
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-1.5 transition-all duration-300" style={{ width: `${(elapsed / SESSION_DURATION) * 100}%`, background: 'linear-gradient(to right, #3D8EFF, #00D4FF)' }} />
            </div>
          </div>
          {totalLiveDwell > 0 && (
            <div className="flex gap-5 mt-3 font-mono text-[10px]">
              <span style={{ color: 'var(--accent)' }}>Charts {fmtDwell(liveDwell.charts)} <span style={{ opacity: 0.5 }}>({dwellPct('charts')}%)</span></span>
              <span style={{ color: 'var(--teal)' }}>Text {fmtDwell(liveDwell.text)} <span style={{ opacity: 0.5 }}>({dwellPct('text')}%)</span></span>
              <span style={{ color: 'var(--amber)' }}>Spatial {fmtDwell(liveDwell.spatial)} <span style={{ opacity: 0.5 }}>({dwellPct('spatial')}%)</span></span>
            </div>
          )}
        </div>

        {/* Round indicator */}
        <div className="flex gap-2 mb-4 justify-center">
          {[0, 1].map(r => (
            <div key={r} className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 tracking-[0.06em] uppercase" style={{
              background: r === round ? 'rgba(61,142,255,0.08)' : 'var(--surface2)',
              color: r === round ? 'var(--accent)' : r < round ? '#0AA880' : 'var(--text3)',
              border: `1px solid ${r === round ? 'rgba(61,142,255,0.2)' : 'var(--border)'}`,
              borderRadius: '2px',
            }}>
              Set {r + 1} {r < round ? '\u2713' : r === round ? '\u25CF' : ''}
            </div>
          ))}
        </div>

        {/* THREE-PANEL GRID — content rotates each round */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Charts — bar chart + scatter + pie + data table */}
          <div ref={chartsRef} className="relative p-4 flex flex-col min-h-[420px] overflow-auto" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--accent)' }} />
            <h2 className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-3" style={{ color: 'var(--accent)' }}>Efficacy Data</h2>
            <div className="flex-1 flex flex-col gap-3">
              {/* Bar chart */}
              <svg viewBox="0 0 280 160" className="w-full opacity-90">
                <text x="140" y="12" textAnchor="middle" fill="#93C5FD" fontSize="9">{CHART_ROUNDS[round].bar.title}</text>
                {CHART_ROUNDS[round].bar.bars.map((bar, i) => (
                  <g key={i}>
                    <rect x={bar.x} y={140 - bar.h} width="28" height={bar.h} fill={bar.c} rx="2" />
                    <text x={bar.x + 14} y="153" textAnchor="middle" fill="#4B5563" fontSize="7">{bar.l}</text>
                  </g>
                ))}
                <line x1="15" y1="140" x2="268" y2="140" stroke="#1F2937" strokeWidth="1" />
                <line x1="15" y1="15" x2="15" y2="140" stroke="#1F2937" strokeWidth="1" />
              </svg>
              {/* Scatter */}
              <svg viewBox="0 0 280 130" className="w-full opacity-90">
                <text x="140" y="12" textAnchor="middle" fill="#93C5FD" fontSize="9">{CHART_ROUNDS[round].scatter.title}</text>
                {CHART_ROUNDS[round].scatter.points.map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="3" fill="#60A5FA" opacity="0.7" />
                ))}
                <line x1="20" y1="120" x2="250" y2="25" stroke="#F59E0B" strokeWidth="1" strokeDasharray="4" />
                <line x1="15" y1="120" x2="260" y2="120" stroke="#1F2937" strokeWidth="1" />
                <line x1="15" y1="15" x2="15" y2="120" stroke="#1F2937" strokeWidth="1" />
              </svg>
              {/* Pie chart */}
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 80 80" className="w-16 h-16 flex-shrink-0">
                  {(() => {
                    let acc = 0;
                    return CHART_ROUNDS[round].pie.slices.map((s, i) => {
                      const start = acc; acc += s.pct / 100;
                      const x1 = 40 + 35 * Math.cos(2 * Math.PI * start - Math.PI / 2);
                      const y1 = 40 + 35 * Math.sin(2 * Math.PI * start - Math.PI / 2);
                      const x2 = 40 + 35 * Math.cos(2 * Math.PI * acc - Math.PI / 2);
                      const y2 = 40 + 35 * Math.sin(2 * Math.PI * acc - Math.PI / 2);
                      const large = s.pct > 50 ? 1 : 0;
                      return <path key={i} d={`M40,40 L${x1},${y1} A35,35 0 ${large},1 ${x2},${y2} Z`} fill={s.c} opacity="0.8" />;
                    });
                  })()}
                </svg>
                <div className="flex flex-col gap-0.5">
                  <div className="text-[9px] text-gray-500 mb-0.5">{CHART_ROUNDS[round].pie.title}</div>
                  {CHART_ROUNDS[round].pie.slices.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 flex-shrink-0" style={{ background: s.c }} />
                      <span className="text-gray-500">{s.l} {s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Data table */}
              <div className="border border-blue-500/10 overflow-hidden">
                <table className="w-full text-[9px]">
                  <thead><tr className="bg-blue-500/5">
                    {CHART_ROUNDS[round].table[0].map((h, i) => (
                      <th key={i} className="px-1.5 py-1 text-blue-400/70 font-medium text-left">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {CHART_ROUNDS[round].table.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-800/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-1.5 py-1 text-gray-500">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Text — dense clinical narrative */}
          <div ref={textRef} className="relative p-4 flex flex-col min-h-[420px]" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--teal)' }} />
            <h2 className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-3" style={{ color: 'var(--teal)' }}>Clinical Narrative</h2>
            <div className="text-[12px] space-y-2.5 flex-1 overflow-auto leading-relaxed pr-1" style={{ color: 'var(--text2)' }}>
              {TEXT_ROUNDS[round].map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>

          {/* Spatial — enrollment grid OR SOC×Grade heatmap */}
          <div ref={spatialRef} className="relative p-4 flex flex-col min-h-[420px] overflow-auto" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--amber)' }} />
            <h2 className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-3" style={{ color: 'var(--amber)' }}>
              {SPATIAL_ROUNDS[round].label}
            </h2>

            {SPATIAL_ROUNDS[round].type === 'enrollment' ? (
              /* Round 1: Site enrollment by region */
              <div className="flex-1 flex flex-col gap-2">
                {SPATIAL_ROUNDS[round].regions!.map((r) => {
                  const pct = Math.round((r.enrolled / r.target) * 100);
                  return (
                    <div key={r.region} className="p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-mono text-[11px] font-medium" style={{ color: 'var(--text)' }}>{r.region}</span>
                        <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text2)' }}>{r.enrolled}/{r.target} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 mb-1.5" style={{ background: 'var(--border)' }}>
                        <div className="h-1.5" style={{ width: `${pct}%`, background: pct >= 75 ? 'var(--teal)' : pct >= 50 ? 'var(--amber)' : 'var(--accent)', transition: 'width 0.3s ease' }} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{r.sites} sites</span>
                        <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>&middot;</span>
                        <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{r.countries.join(', ')}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex justify-between font-mono text-[10px]" style={{ color: 'var(--text2)' }}>
                    <span>Total: 47 sites</span>
                    <span>624 / 800 enrolled (78%)</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Round 2: SOC × Grade heatmap from real clinical data */
              <div className="flex-1 flex flex-col">
                <div className="overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_48px_48px_48px_48px]" style={{ background: 'var(--surface)' }}>
                    <div className="px-2 py-1.5 font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: 'var(--text3)' }}>SOC</div>
                    <div className="px-1 py-1.5 font-mono text-[9px] text-center" style={{ color: '#0FC9A0' }}>G1</div>
                    <div className="px-1 py-1.5 font-mono text-[9px] text-center" style={{ color: '#F59E0B' }}>G2</div>
                    <div className="px-1 py-1.5 font-mono text-[9px] text-center" style={{ color: '#EA580C' }}>G3</div>
                    <div className="px-1 py-1.5 font-mono text-[9px] text-center" style={{ color: '#E03C3C' }}>G4</div>
                  </div>
                  {/* Data rows */}
                  {SOC_DATA.map((row) => {
                    const max = Math.max(row.g1, row.g2, row.g3, row.g4);
                    const cellBg = (val: number, color: string) => {
                      const intensity = max > 0 ? val / max : 0;
                      return { background: `${color}${Math.round(intensity * 30 + 5).toString(16).padStart(2, '0')}` };
                    };
                    return (
                      <div key={row.soc} className="grid grid-cols-[1fr_48px_48px_48px_48px]" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--text2)' }}>{row.soc}</div>
                        <div className="px-1 py-1.5 font-mono text-[10px] text-center tabular-nums" style={{ ...cellBg(row.g1, '#0FC9A0'), color: 'var(--text2)' }}>{row.g1}</div>
                        <div className="px-1 py-1.5 font-mono text-[10px] text-center tabular-nums" style={{ ...cellBg(row.g2, '#F59E0B'), color: 'var(--text2)' }}>{row.g2}</div>
                        <div className="px-1 py-1.5 font-mono text-[10px] text-center tabular-nums" style={{ ...cellBg(row.g3, '#EA580C'), color: 'var(--text2)' }}>{row.g3}</div>
                        <div className="px-1 py-1.5 font-mono text-[10px] text-center tabular-nums" style={{ ...cellBg(row.g4, '#E03C3C'), color: 'var(--text2)' }}>{row.g4}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex gap-4 mt-3 font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
                  <span>n = patient count per SOC × Grade</span>
                  <span>Darker = higher relative frequency</span>
                </div>
                <div className="flex gap-3 mt-2">
                  {[{ g: 'Grade 1', c: '#0FC9A0' }, { g: 'Grade 2', c: '#F59E0B' }, { g: 'Grade 3', c: '#EA580C' }, { g: 'Grade 4', c: '#E03C3C' }].map(({ g, c }) => (
                    <div key={g} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5" style={{ background: c, opacity: 0.6 }} />
                      <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center font-mono text-[10px] mt-5" style={{ color: 'var(--text3)' }}>Look naturally at the content that interests you most</p>
      </main>
    );
  }

  // ─── DONE ───
  return (
    <main className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--surface)' }}>
      {result && (
        <div className="max-w-md w-full space-y-6">
          <div className="p-8" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
            <h2 className="font-serif text-[20px] mb-1" style={{ color: 'var(--text)' }}>Cognitive Style Result</h2>
            <p className="font-mono text-[10px] mb-6" style={{ color: 'var(--text3)' }}>Based on 13-feature gaze analysis with ensemble classification</p>

            <div className="text-center mb-8">
              <p className="text-[13px] mb-2" style={{ color: 'var(--text2)' }}>You&apos;re a</p>
              <div className="font-serif text-[36px]" style={{ color: result.dominant === 'visualizer' ? 'var(--accent)' : result.dominant === 'verbalizer' ? 'var(--teal)' : 'var(--amber)' }}>
                {result.dominant.charAt(0).toUpperCase() + result.dominant.slice(1)}
              </div>
              <p className="text-[13px] mt-2" style={{ color: 'var(--text2)' }}>
                Your dashboard will prioritize {result.dominant === 'visualizer' ? 'charts and visual encodings' : result.dominant === 'verbalizer' ? 'clinical narratives and tables' : 'spatial layouts and heatmaps'}.
              </p>
              {result.confidence >= 0.5 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
                  <span className="font-mono text-[10px]" style={{ color: 'var(--teal)' }}>High confidence</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {[
                { label: 'Visualizer', value: result.visualizer, c: 'var(--accent)' },
                { label: 'Verbalizer', value: result.verbalizer, c: 'var(--teal)' },
                { label: 'Spatial', value: result.spatial, c: 'var(--amber)' },
              ].map(({ label, value, c }) => (
                <div key={label}>
                  <div className="flex justify-between text-[12px] mb-1.5">
                    <span className="font-mono text-[11px]" style={{ color: c }}>{label}</span>
                    <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text3)' }}>{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden" style={{ background: 'var(--surface2)' }}>
                    <div className="h-2 transition-all duration-700" style={{ width: `${value * 100}%`, background: c }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Multi-session Bayesian result */}
            {bayesianState && bayesianState.sessionCount > 0 && multiSessionResult && (
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: 'var(--accent)' }}>Multi-Session Profile</h3>
                  <span className="font-mono text-[9px] px-2 py-0.5" style={{ background: 'rgba(61,142,255,0.08)', color: 'var(--accent)', border: '1px solid rgba(61,142,255,0.15)', borderRadius: '2px' }}>
                    {bayesianState.sessionCount} session{bayesianState.sessionCount > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-center mb-4">
                  <div className="font-serif text-[22px]" style={{ color: multiSessionResult.dominant === 'visualizer' ? 'var(--accent)' : multiSessionResult.dominant === 'verbalizer' ? 'var(--teal)' : 'var(--amber)' }}>
                    {multiSessionResult.dominant.charAt(0).toUpperCase() + multiSessionResult.dominant.slice(1)}
                  </div>
                  {multiSessionResult.confidence >= 0.5 && (
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--teal)' }} />
                      <span className="font-mono text-[10px]" style={{ color: 'var(--teal)' }}>High confidence</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Visualizer', value: multiSessionResult.visualizer, c: 'var(--accent)' },
                    { label: 'Verbalizer', value: multiSessionResult.verbalizer, c: 'var(--teal)' },
                    { label: 'Spatial', value: multiSessionResult.spatial, c: 'var(--amber)' },
                  ].map(({ label, value, c }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{label}</span>
                        <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text3)' }}>{Math.round(value * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden" style={{ background: 'var(--surface2)' }}>
                        <div className="h-1.5 transition-all duration-700" style={{ width: `${value * 100}%`, background: c, opacity: 0.7 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {features && (
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase font-medium mb-3" style={{ color: 'var(--text3)' }}>Raw Feature Vector</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {['Text Dwell', 'Chart Dwell', 'Spatial Dwell', 'Gaze Entropy', 'Avg Fix Dur', 'Trans Rate', 'Focus Ratio', 'Saccade Amp', 'Coeff K', 'Dwell Drift', 'BCEA', 'Aspect Ratio', 'Reading Score'].map((label, i) => (
                    <div key={label} className="flex justify-between">
                      <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{label}</span>
                      <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--text2)' }}>{features[i]?.toFixed(3) ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}