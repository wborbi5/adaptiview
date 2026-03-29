'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Particle canvas for left panel ───
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * W(),
        y: Math.random() * H(),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W();
        if (p.x > W()) p.x = 0;
        if (p.y < 0) p.y = H();
        if (p.y > H()) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(61, 142, 255, ${p.o})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(61, 142, 255, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// ─── Floating data cards ───
function FloatingCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`absolute bg-[#0C1728]/90 backdrop-blur-sm border border-[#1a2a45] p-4 ${className || ''}`}
      style={{ borderRadius: 0, ...style }}
    >
      {children}
    </div>
  );
}

function Sparkbars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-[2px] h-[20px]">
      {data.map((v, i) => (
        <div key={i} style={{ width: 4, height: `${(v / max) * 100}%`, background: color, opacity: 0.6 + (i / data.length) * 0.4 }} />
      ))}
    </div>
  );
}

// ─── Heatmap mini ───
function MiniHeatmap() {
  const cells = [
    [0.2,0.4,0.8,0.6,0.3,0.5,0.7,0.9],
    [0.5,0.7,0.3,0.9,0.6,0.4,0.8,0.2],
    [0.8,0.3,0.6,0.4,0.9,0.7,0.5,0.1],
  ];
  return (
    <div className="grid grid-cols-8 gap-[2px]">
      {cells.flat().map((v, i) => (
        <div key={i} style={{ width: 14, height: 10, background: `rgba(61,142,255,${v * 0.8 + 0.1})` }} />
      ))}
    </div>
  );
}

// ─── Main Login Page ───
export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => router.push('/onboard'), 600);
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#06101D' }}>
      {/* Left panel — data visualization */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: '#080F1A', borderRight: '1px solid #1a2a45' }}>
        <ParticleCanvas />
        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: '#3D8EFF' }}>AdaptiView™</div>
            <div className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1" style={{ color: '#3a5070' }}>Clinical Intelligence Platform</div>
          </div>
          {/* Floating data cards */}
          <div className="relative flex-1">
            <FloatingCard className="w-64" style={{ top: '15%', left: '10%' }}>
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase mb-2" style={{ color: '#3D8EFF' }}>CROWN-7 Safety Signal</div>
              <div className="font-mono text-[11px] mb-1" style={{ color: '#e8ecf2' }}>Hy&apos;s Law · 2 Patients</div>
              <div className="font-mono text-[9px]" style={{ color: '#e04c4c' }}>ALT &gt;3×ULN + Bili &gt;2×ULN</div>
              <div className="mt-2"><Sparkbars data={[2,4,8,14,22,31,41,51]} color="#e04c4c" /></div>
            </FloatingCard>
            <FloatingCard className="w-56" style={{ top: '40%', left: '45%' }}>
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase mb-2" style={{ color: '#3D8EFF' }}>Attention Heatmap</div>
              <MiniHeatmap />
            </FloatingCard>
            <FloatingCard className="w-52" style={{ top: '65%', left: '8%' }}>
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase mb-2" style={{ color: '#3D8EFF' }}>Cognitive Style</div>
              <div className="font-serif text-[18px]" style={{ color: '#e8ecf2' }}>Visualizer</div>
              <div className="font-mono text-[9px] mt-1" style={{ color: '#6adbbb' }}>87% confidence</div>
            </FloatingCard>
          </div>
          <div className="font-mono text-[8px] tracking-[0.1em]" style={{ color: '#253040' }}>
            21 CFR Part 11 Compliant · GCP Ready · CDISC ODM
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#06101D' }}>
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase mb-1 lg:hidden" style={{ color: '#3D8EFF' }}>AdaptiView™</div>
            <h1 className="font-serif text-[28px]" style={{ color: '#e8ecf2' }}>Sign in</h1>
            <p className="font-mono text-[10px] mt-1" style={{ color: '#3a5070' }}>Access your clinical intelligence dashboard</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="font-mono text-[9px] tracking-[0.1em] uppercase block mb-1.5" style={{ color: '#3a5070' }}>Email / Site ID</label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="reviewer@sponsor.com"
                className="w-full px-4 py-3 font-mono text-[12px] outline-none"
                style={{ background: '#0C1728', border: '1px solid #1a2a45', color: '#e8ecf2', borderRadius: 0 }}
              />
            </div>
            <div>
              <label className="font-mono text-[9px] tracking-[0.1em] uppercase block mb-1.5" style={{ color: '#3a5070' }}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 font-mono text-[12px] outline-none"
                style={{ background: '#0C1728', border: '1px solid #1a2a45', color: '#e8ecf2', borderRadius: 0 }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 font-mono text-[11px] tracking-[0.15em] uppercase transition-opacity hover:opacity-80 disabled:opacity-60"
              style={{ background: '#3D8EFF', color: '#fff', borderRadius: 0 }}
            >
              {loading ? 'Loading dashboard…' : 'Continue'}
            </button>
          </form>

          <p className="font-mono text-[8px] mt-8 text-center" style={{ color: '#253040' }}>
            Gaze tracking will calibrate on next screen · Camera access required
          </p>
        </div>
      </div>
    </div>
  );
}
