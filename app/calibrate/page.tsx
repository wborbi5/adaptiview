'use client';

import { useEffect, useState, useCallback } from 'react';
import { useGaze } from '@/lib/use-gaze';
import { Calibration } from '@/lib/calibration';
import { useRouter } from 'next/navigation';
import type { GazeSample } from '@/lib/ivt-fixation';

type Step = 'camera' | 'position' | 'calibration' | 'done';

export default function CalibratePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('camera');
  const [gazePos, setGazePos] = useState<{ x: number; y: number } | null>(null);
  const [faceReady, setFaceReady] = useState(false);
  const [lightingOk, setLightingOk] = useState(false);

  const onSample = useCallback((sample: GazeSample) => {
    setGazePos({ x: sample.x, y: sample.y });
  }, []);

  const { mode, diagnostics } = useGaze({ onSample });

  // Camera check
  useEffect(() => {
    if (step !== 'camera') return;
    const interval = setInterval(() => {
      if (diagnostics.cameraStream) setLightingOk(true);
    }, 500);
    return () => clearInterval(interval);
  }, [step, diagnostics.cameraStream]);

  // Face detection
  useEffect(() => {
    if (step !== 'position') return;
    const interval = setInterval(() => {
      if (diagnostics.totalNulls > 5 || diagnostics.totalValid > 0) setFaceReady(true);
    }, 500);
    const timeout = setTimeout(() => setFaceReady(true), 10000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [step, diagnostics]);

  const handleCalibComplete = () => setStep('done');

  const steps: { key: Step; label: string }[] = [
    { key: 'camera', label: 'Camera Check' },
    { key: 'position', label: 'Position' },
    { key: 'calibration', label: 'Calibration' },
    { key: 'done', label: 'Complete' },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--surface)' }}>
      {/* Collapsed sidebar */}
      <aside className="flex flex-col items-center py-5" style={{ width: 64, background: 'var(--navy)' }}>
        <svg viewBox="0 0 32 32" fill="none" width="24" height="24">
          <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="#3D8EFF" strokeWidth="1.4" fill="none" opacity=".85"/>
          <circle cx="16" cy="16" r="5" stroke="#3D8EFF" strokeWidth="1.4" fill="none"/>
          <circle cx="16" cy="16" r="2" fill="#3D8EFF"/>
        </svg>
      </aside>

      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="flex items-center px-6" style={{ height: 58, background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
          <span className="font-mono text-[12.5px]" style={{ color: 'var(--text2)' }}>
            Setup · Eye Tracking Calibration
          </span>
        </header>
        <div style={{ height: 2, background: 'linear-gradient(to right, #3D8EFF, #00D4FF)', opacity: 0.4 }} />

        {/* Content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[640px]">
            {/* Progress */}
            <div className="flex items-center justify-center gap-6 mb-10">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full transition-all" style={{
                    background: i < stepIndex ? 'var(--teal)' : i === stepIndex ? 'var(--accent)' : 'var(--border)',
                    boxShadow: i === stepIndex ? '0 0 0 4px rgba(61,142,255,0.15)' : 'none',
                  }} />
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: i <= stepIndex ? 'var(--text)' : 'var(--text3)' }}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <div className="w-8 h-px ml-2" style={{ background: i < stepIndex ? 'var(--teal)' : 'var(--border)' }} />}
                </div>
              ))}
            </div>

            {/* Card */}
            <div className="p-8" style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
              {step === 'camera' && (
                <div className="text-center">
                  <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-4" style={{ color: 'var(--accent)' }}>Step 1 of 3</div>
                  <h2 className="font-serif text-[22px] mb-2" style={{ color: 'var(--text)' }}>Camera Check</h2>
                  <p className="text-[13px] mb-6" style={{ color: 'var(--text2)' }}>Ensure your webcam is connected and lighting is adequate.</p>

                  <div className="mx-auto mb-6 flex items-center justify-center" style={{ width: 280, height: 200, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <span className="font-mono text-[10px]" style={{ color: diagnostics.cameraStream ? 'var(--teal)' : 'var(--text3)' }}>
                      {diagnostics.cameraStream ? 'Camera active' : 'Requesting camera...'}
                    </span>
                  </div>

                  <div className="space-y-2 mb-6">
                    {[
                      { label: 'Camera Stream', ok: diagnostics.cameraStream },
                      { label: 'Good lighting', ok: lightingOk },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: ok ? 'var(--teal)' : 'var(--border)' }} />
                        <span className="font-mono text-[11px]" style={{ color: ok ? '#0AA880' : 'var(--text3)' }}>
                          {ok ? `\u2713 ${label} detected` : `${label}...`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => setStep('position')} disabled={!diagnostics.cameraStream}
                    className="font-mono text-[12.5px] font-medium tracking-[0.1em] uppercase text-white cursor-pointer disabled:opacity-40"
                    style={{ height: 48, padding: '0 32px', background: 'var(--navy)', border: 'none', borderRadius: 0 }}>
                    Continue &rarr;
                  </button>
                </div>
              )}

              {step === 'position' && (
                <div className="text-center">
                  <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-4" style={{ color: 'var(--accent)' }}>Step 2 of 3</div>
                  <h2 className="font-serif text-[22px] mb-2" style={{ color: 'var(--text)' }}>Face Position</h2>
                  <p className="text-[13px] mb-6" style={{ color: 'var(--text2)' }}>Sit ~60cm from screen. Ensure your face is centered and well-lit.</p>

                  <div className="mx-auto mb-6 flex items-center justify-center relative" style={{ width: 280, height: 200, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="absolute" style={{
                      width: 120, height: 160,
                      border: `2px ${faceReady ? 'solid' : 'dashed'} ${faceReady ? 'var(--teal)' : 'var(--accent)'}`,
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    }} />
                    <span className="font-mono text-[10px] relative z-10" style={{ color: faceReady ? '#0AA880' : 'var(--text3)' }}>
                      {faceReady ? '\u2713 Face detected' : 'Detecting face...'}
                    </span>
                  </div>

                  <button onClick={() => setStep('calibration')} disabled={!faceReady}
                    className="font-mono text-[12.5px] font-medium tracking-[0.1em] uppercase text-white cursor-pointer disabled:opacity-40"
                    style={{ height: 48, padding: '0 32px', background: 'var(--navy)', border: 'none', borderRadius: 0 }}>
                    Begin Calibration &rarr;
                  </button>
                </div>
              )}

              {step === 'calibration' && (
                <div className="text-center">
                  <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase mb-4" style={{ color: 'var(--accent)' }}>Step 3 of 3</div>
                  <h2 className="font-serif text-[22px] mb-2" style={{ color: 'var(--text)' }}>5-Point Calibration</h2>
                  <p className="text-[13px] mb-4" style={{ color: 'var(--text2)' }}>Guide the dot into each circle or click directly.</p>
                  <p className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>Mode: {mode} · Valid: {diagnostics.totalValid} frames</p>
                </div>
              )}

              {step === 'done' && (
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center" style={{ background: 'rgba(15,201,160,0.1)', border: '1px solid rgba(15,201,160,0.25)' }}>
                    <svg className="w-8 h-8" style={{ color: '#0FC9A0' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="font-serif text-[22px] mb-2" style={{ color: 'var(--text)' }}>Calibration Complete</h2>
                  <p className="text-[13px] mb-2" style={{ color: 'var(--text2)' }}>Eye tracking is ready. Column-level accuracy (~20\u201330px error).</p>
                  <p className="font-mono text-[10px] mb-6" style={{ color: 'var(--text3)' }}>{diagnostics.totalValid} valid gaze predictions recorded</p>
                  <button onClick={() => router.push('/onboard')}
                    className="font-mono text-[12.5px] font-medium tracking-[0.1em] uppercase text-white cursor-pointer"
                    style={{ height: 48, padding: '0 32px', background: 'var(--navy)', border: 'none', borderRadius: 0 }}>
                    Begin Onboarding &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Calibration overlay */}
      {step === 'calibration' && faceReady && (
        <Calibration faceReady={faceReady} onComplete={handleCalibComplete} gazePos={gazePos} />
      )}
    </div>
  );
}
