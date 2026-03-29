'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebGazer } from './webgazer-loader';

const CALIB_DOTS = [
  { x: 50, y: 50 },
  { x: 15, y: 15 },
  { x: 85, y: 15 },
  { x: 15, y: 85 },
  { x: 85, y: 85 },
];

const CIRCLE_RADIUS = 125;
const GAZE_HIT_RADIUS = 180;
const FILL_DURATION_MS = 1500;
const CLICK_RECORD_MS = 1200;

interface CalibrationProps {
  onComplete: () => void;
  faceReady: boolean;
  gazePos: { x: number; y: number } | null;
}

export function Calibration({ onComplete, faceReady, gazePos }: CalibrationProps) {
  const [currentDot, setCurrentDot] = useState(0);
  const [fillPct, setFillPct] = useState(0);
  const [filling, setFilling] = useState(false);
  const [done, setDone] = useState(false);

  const fillAccumRef = useRef(0);
  const lastTickRef = useRef(0);
  const animRef = useRef(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gazePosRef = useRef(gazePos);
  const currentDotRef = useRef(0);
  const isFillingRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => { gazePosRef.current = gazePos; }, [gazePos]);
  useEffect(() => { currentDotRef.current = currentDot; }, [currentDot]);

  const getScreenPos = useCallback((dotIndex: number) => {
    const dot = CALIB_DOTS[dotIndex];
    return {
      x: (dot.x / 100) * window.innerWidth,
      y: (dot.y / 100) * window.innerHeight,
    };
  }, []);

  const recordSamples = useCallback((dotIndex: number) => {
    const wg = getWebGazer();
    if (!wg) return;
    const pos = getScreenPos(dotIndex);
    for (let i = 0; i < 8; i++) {
      wg.recordScreenPosition(pos.x, pos.y, 'click');
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = setInterval(() => {
      wg.recordScreenPosition(pos.x, pos.y, 'click');
    }, 60);
  }, [getScreenPos]);

  const advanceDot = useCallback(() => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    cancelAnimationFrame(animRef.current);
    fillAccumRef.current = 0;
    isFillingRef.current = false;
    setFilling(false);
    setFillPct(0);

    const next = currentDotRef.current + 1;
    if (next >= CALIB_DOTS.length) {
      doneRef.current = true;
      setDone(true);
      setTimeout(() => onComplete(), 600);
    } else {
      setCurrentDot(next);
    }
  }, [onComplete]);

  useEffect(() => {
    if (!faceReady || done) return;
    lastTickRef.current = performance.now();

    const tick = () => {
      if (doneRef.current) return;
      const now = performance.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const gaze = gazePosRef.current;
      const pos = getScreenPos(currentDotRef.current);

      if (gaze) {
        const dist = Math.sqrt((gaze.x - pos.x) ** 2 + (gaze.y - pos.y) ** 2);
        const inside = dist < GAZE_HIT_RADIUS;

        if (inside) {
          if (!isFillingRef.current) {
            isFillingRef.current = true;
            setFilling(true);
            recordSamples(currentDotRef.current);
          }
          fillAccumRef.current += dt;
        } else {
          fillAccumRef.current = Math.max(0, fillAccumRef.current - dt * 0.5);
          if (isFillingRef.current && fillAccumRef.current <= 0) {
            isFillingRef.current = false;
            setFilling(false);
            if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
          }
        }
      }

      const pct = Math.min(100, (fillAccumRef.current / FILL_DURATION_MS) * 100);
      setFillPct(pct);

      if (fillAccumRef.current >= FILL_DURATION_MS) {
        advanceDot();
      } else {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [faceReady, done, currentDot, getScreenPos, recordSamples, advanceDot]);

  const handleCircleClick = () => {
    if (done) return;
    recordSamples(currentDot);
    fillAccumRef.current = 0;
    isFillingRef.current = true;
    setFilling(true);

    const start = Date.now();
    const clickFill = setInterval(() => {
      const elapsed = Date.now() - start;
      fillAccumRef.current = elapsed;
      setFillPct(Math.min(100, (elapsed / CLICK_RECORD_MS) * 100));
      if (elapsed >= CLICK_RECORD_MS) {
        clearInterval(clickFill);
        advanceDot();
      }
    }, 30);
  };

  if (!faceReady || done) return null;

  const dot = CALIB_DOTS[currentDot];

  return (
    <>
      {/* Dim background overlay */}
      <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-[9998]" />

      {/* Gaze dot */}
      {gazePos && (
        <div
          className={`fixed rounded-full pointer-events-none z-[10002] transition-all duration-150 ${
            filling
              ? 'w-5 h-5 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
              : 'w-4 h-4 bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.4)]'
          }`}
          style={{ left: gazePos.x, top: gazePos.y, transform: 'translate(-50%, -50%)' }}
        />
      )}

      {/* Header */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[10001] text-center pointer-events-none">
        <div className="bg-gray-900/80 backdrop-blur-md border border-gray-700/50 rounded-2xl px-8 py-4 shadow-2xl">
          <h2 className="text-lg font-bold mb-1 text-white">Calibration</h2>
          <p className="text-gray-400 text-sm">
            {filling
              ? 'Hold steady...'
              : 'Guide the red dot into the circle — or click it'
            }
          </p>
        </div>
      </div>

      {/* Target circle */}
      <button
        onClick={handleCircleClick}
        className="fixed z-[10000] cursor-pointer group"
        style={{
          left: `${dot.x}%`,
          top: `${dot.y}%`,
          transform: 'translate(-50%, -50%)',
          width: CIRCLE_RADIUS * 2,
          height: CIRCLE_RADIUS * 2,
        }}
      >
        <svg className="absolute inset-0 w-full h-full drop-shadow-2xl" viewBox="0 0 250 250">
          <circle cx="125" cy="125" r="118" fill="rgba(17,24,39,0.6)" stroke="#374151" strokeWidth="3" />
          <circle
            cx="125" cy="125" r="118" fill="none"
            stroke={filling ? '#34D399' : '#FBBF24'}
            strokeWidth="5"
            strokeDasharray={`${fillPct * 7.414} 741.4`}
            strokeLinecap="round"
            transform="rotate(-90 125 125)"
            className="transition-colors duration-200"
            style={{ filter: filling ? 'drop-shadow(0 0 8px rgba(52,211,153,0.5))' : 'drop-shadow(0 0 6px rgba(251,191,36,0.3))' }}
          />
        </svg>
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-200 ${
          filling
            ? 'w-10 h-10 bg-emerald-400 border-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.5)]'
            : 'w-8 h-8 bg-yellow-400 border-yellow-300 animate-pulse shadow-[0_0_20px_rgba(250,204,21,0.4)] group-hover:scale-125'
        }`} />
      </button>

      {/* Progress dots */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[10001] flex gap-3">
        {CALIB_DOTS.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i < currentDot
                ? 'w-3 h-3 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                : i === currentDot
                ? 'w-4 h-4 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.4)]'
                : 'w-3 h-3 bg-gray-700'
            }`}
          />
        ))}
      </div>
    </>
  );
}
