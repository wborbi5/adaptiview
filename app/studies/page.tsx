'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { loadPrior, posteriorMean } from '@/lib/bayesian-accumulator';
import { getMedidataStudies, MedidataStudy } from '@/lib/medidata-client';
import { STORAGE_KEYS } from '@/lib/constants';

const STUDY_EXTRA = {
  sponsor: 'AdaptiView Therapeutics',
  arms: ['Experimental (AV-101 200mg QD)', 'Standard of Care (Erlotinib 150mg QD)'],
  primary: 'Investigator-assessed Progression-Free Survival',
  grade3plus: '31%',
  hysLaw: '2 patients',
  deaths: 7,
};

export default function StudiesPage() {
  const router = useRouter();
  const [adaptationMode, setAdaptationMode] = useState<string | undefined>(undefined);
  const [showConsent, setShowConsent] = useState(false);
  const [studies, setStudies] = useState<MedidataStudy[]>([]);
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    const prior = loadPrior();
    if (prior.sessionCount > 0) {
      const pm = posteriorMean(prior);
      setAdaptationMode(pm.dominant);
    }
    getMedidataStudies().then(data => {
      setStudies(data);
      setSyncing(false);
    });
  }, []);

  const handleBeginReview = () => setShowConsent(true);

  const handleConsent = () => {
    sessionStorage.setItem(STORAGE_KEYS.GAZE_CONSENT, 'true');
    router.push('/studies/crown-7');
  };

  const activeStudy = studies.find(s => s.studyOid === 'CROWN-7');
  const pct = activeStudy ? Math.round((activeStudy.enrolled / activeStudy.target) * 100) : 0;

  return (
    <AppShell adaptationMode={adaptationMode}>
      {/* Medidata sync banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 24px',
        background: 'rgba(15,201,160,0.04)',
        borderBottom: '1px solid rgba(15,201,160,0.12)',
        marginBottom: 24,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: syncing ? 'var(--amber)' : 'var(--teal)',
          flexShrink: 0,
        }}/>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: 'var(--text3)',
          letterSpacing: '0.06em',
        }}>
          MEDIDATA RAVE &nbsp;&middot;&nbsp; {syncing ? 'Syncing...' : `${studies.length} studies synced · Last updated just now`}
        </span>
      </div>

      {syncing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: 24 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              background: 'var(--surface2)', height: 180,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}/>
          ))}
        </div>
      ) : (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Study header */}
        {activeStudy && (
        <>
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className={`${activeStudy.status === 'ACTIVE' ? 'status-active' : activeStudy.status === 'ON_HOLD' ? 'status-onhold' : 'status-completed'} font-mono text-[10px] tracking-[0.04em] px-2 py-0.5`}>
              {activeStudy.status === 'ACTIVE' ? 'Active — Enrolling' : activeStudy.status === 'ON_HOLD' ? 'On Hold' : 'Completed'}
            </span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
              {activeStudy.nctNumber}
            </span>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9,
              color: 'var(--teal)', letterSpacing: '0.06em',
              border: '1px solid rgba(15,201,160,0.25)',
              borderRadius: 2, padding: '1px 5px',
            }}>
              ● MEDIDATA RAVE
            </span>
          </div>
          <h1 className="font-serif text-[28px]" style={{ color: 'var(--text)' }}>
            {activeStudy.studyOid}
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--text2)' }}>
            {activeStudy.studyName.replace(`${activeStudy.studyOid}: `, '')}
          </p>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Sites', value: String(activeStudy.sites), bar: 'stat-bar-blue' },
            { label: 'Enrolled', value: `${activeStudy.enrolled} / ${activeStudy.target}`, bar: 'stat-bar-teal' },
            { label: 'Grade 3+ Rate', value: STUDY_EXTRA.grade3plus, bar: 'stat-bar-amber' },
            { label: "Hy's Law", value: STUDY_EXTRA.hysLaw, bar: 'stat-bar-red' },
          ].map((s) => (
            <div
              key={s.label}
              className={`relative ${s.bar}`}
              style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: '16px 18px' }}
            >
              <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase block" style={{ color: 'var(--text3)' }}>
                {s.label}
              </span>
              <span className="font-serif text-[24px] block mt-1" style={{ color: 'var(--text)', lineHeight: 1.1 }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Study details card */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: 24 }} className="mb-6">
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            {[
              { label: 'Sponsor', value: STUDY_EXTRA.sponsor },
              { label: 'Database Lock', value: activeStudy.dataLockDate },
              { label: 'Primary Endpoint', value: STUDY_EXTRA.primary },
              { label: 'Deaths (All Cause)', value: String(STUDY_EXTRA.deaths) },
            ].map((item) => (
              <div key={item.label}>
                <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase block mb-1" style={{ color: 'var(--text3)' }}>
                  {item.label}
                </span>
                <span className="text-[13px]" style={{ color: 'var(--text)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* Treatment arms */}
          <div className="mt-5">
            <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase block mb-2" style={{ color: 'var(--text3)' }}>
              Treatment Arms
            </span>
            <div className="flex gap-3">
              {STUDY_EXTRA.arms.map((arm, i) => (
                <div
                  key={i}
                  className="flex-1 px-3 py-2"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text2)' }}>{arm}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Enrollment bar */}
          <div className="mt-5">
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase" style={{ color: 'var(--text3)' }}>
                Enrollment Progress
              </span>
              <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text2)' }}>
                {pct}%
              </span>
            </div>
            <div style={{ width: '100%', height: 6, background: 'var(--border)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>

        {/* Other studies from Medidata */}
        {studies.filter(s => s.studyOid !== 'CROWN-7').length > 0 && (
          <div className="mb-6">
            <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase block mb-3" style={{ color: 'var(--text3)' }}>
              Other Studies
            </span>
            <div className="grid grid-cols-2 gap-4">
              {studies.filter(s => s.studyOid !== 'CROWN-7').map(s => (
                <div key={s.studyOid} style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: '16px 18px', opacity: 0.7 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`${s.status === 'ACTIVE' ? 'status-active' : s.status === 'ON_HOLD' ? 'status-onhold' : 'status-completed'} font-mono text-[9px] tracking-[0.04em] px-1.5 py-0.5`}>
                      {s.status}
                    </span>
                    <span style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 9,
                      color: 'var(--teal)', letterSpacing: '0.06em',
                      border: '1px solid rgba(15,201,160,0.25)',
                      borderRadius: 2, padding: '1px 5px',
                    }}>
                      ● MEDIDATA RAVE
                    </span>
                  </div>
                  <div className="font-serif text-[16px]" style={{ color: 'var(--text)' }}>{s.studyOid}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--text2)' }}>{s.studyName.replace(`${s.studyOid}: `, '')}</div>
                  <div className="font-mono text-[10px] mt-2 tabular-nums" style={{ color: 'var(--text3)' }}>
                    {s.enrolled}/{s.target} enrolled · {s.sites} sites
                  </div>
                  {s.holdReason && (
                    <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--amber)' }}>{s.holdReason}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Begin Review CTA */}
        <div
          className="text-center py-10"
          style={{ background: 'var(--white)', border: '1px solid var(--border)' }}
        >
          <svg viewBox="0 0 32 32" fill="none" width="40" height="40" className="mx-auto mb-4">
            <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="var(--accent)" strokeWidth="1.4" fill="none" opacity=".85"/>
            <circle cx="16" cy="16" r="5" stroke="var(--accent)" strokeWidth="1.4" fill="none"/>
            <circle cx="16" cy="16" r="2" fill="var(--accent)"/>
          </svg>
          <h2 className="font-serif text-[20px] mb-2" style={{ color: 'var(--text)' }}>
            Ready to Review
          </h2>
          <p className="text-[13px] mb-6 max-w-[400px] mx-auto" style={{ color: 'var(--text2)' }}>
            AdaptiView will track your gaze during the review to adapt the dashboard layout in real time.
          </p>
          <button
            onClick={handleBeginReview}
            className="font-mono text-[12.5px] font-medium tracking-[0.1em] uppercase text-white cursor-pointer"
            style={{ height: 48, padding: '0 40px', background: 'var(--navy)', border: 'none' }}
          >
            Begin Review &rarr;
          </button>
        </div>
        </>
        )}
      </div>
      )}

      {/* Consent overlay */}
      {showConsent && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(7,16,31,0.7)' }}
        >
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: 32, width: 440 }}>
            <div className="flex items-center gap-3 mb-4">
              <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
                <path d="M12 8v4M12 16h.01" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-[11px] tracking-[0.08em] uppercase font-medium" style={{ color: 'var(--text)' }}>
                Camera Access Required
              </span>
            </div>

            <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text2)' }}>
              AdaptiView will use your webcam to track eye movement during this safety data review. This enables real-time layout adaptation based on your cognitive style.
            </p>

            <div className="space-y-2 mb-6">
              {[
                'Gaze data is processed locally in your browser',
                'No video is recorded or transmitted',
                'You can stop tracking at any time',
              ].map((line) => (
                <div key={line} className="flex items-start gap-2">
                  <svg viewBox="0 0 16 16" fill="none" width="14" height="14" className="flex-shrink-0 mt-0.5">
                    <path d="M4 8l3 3 5-5" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text2)' }}>{line}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConsent}
                className="flex-1 font-mono text-[11px] font-medium tracking-[0.08em] uppercase text-white cursor-pointer"
                style={{ height: 42, background: 'var(--navy)', border: 'none' }}
              >
                Enable Camera &amp; Begin
              </button>
              <button
                onClick={() => setShowConsent(false)}
                className="font-mono text-[11px] tracking-[0.08em] uppercase cursor-pointer"
                style={{ height: 42, padding: '0 20px', background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
