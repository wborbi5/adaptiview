'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface AppShellProps {
  children: React.ReactNode;
  adaptationMode?: string;
  sessionCount?: number;
  confidence?: number;
}

const NAV_ITEMS = [
  { href: '/studies',         label: 'Overview',         icon: 'grid' },
  { href: '/studies/crown-7', label: 'Adverse Events',   icon: 'alert', badge: '2', badgeColor: 'red' },
  { href: '/attention',       label: 'Attention Report', icon: 'eye' },
];

const ICONS: Record<string, JSX.Element> = {
  grid: <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>,
  alert: <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>,
  eye: <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>,
  settings: <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
  help: <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>,
};

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <svg viewBox="0 0 32 32" fill="none" width="28" height="28" className="flex-shrink-0">
        <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="#3D8EFF" strokeWidth="1.4" fill="none" opacity=".85"/>
        <circle cx="16" cy="16" r="5" stroke="#3D8EFF" strokeWidth="1.4" fill="none"/>
        <circle cx="16" cy="16" r="2" fill="#3D8EFF"/>
        <line x1="16" y1="3" x2="16" y2="7" stroke="#3D8EFF" strokeWidth="1" opacity=".5"/>
        <line x1="16" y1="25" x2="16" y2="29" stroke="#3D8EFF" strokeWidth="1" opacity=".5"/>
        <circle cx="16" cy="5" r="1.2" fill="#3D8EFF" opacity=".6"/>
        <circle cx="16" cy="27" r="1.2" fill="#3D8EFF" opacity=".6"/>
      </svg>
      {!collapsed && (
        <span className="font-serif text-[17px] text-white tracking-tight">
          Adapti<span style={{ color: '#3D8EFF' }}>View</span>
        </span>
      )}
    </div>
  );
}

export default function AppShell({ children, adaptationMode, sessionCount, confidence }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const sidebarW = collapsed ? 64 : 240;

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--surface)' }}>
      {/* Sidebar */}
      <aside
        className="fixed top-0 left-0 bottom-0 flex flex-col z-50 transition-all duration-200"
        style={{ width: sidebarW, background: 'var(--navy)' }}
      >
        <Logo collapsed={collapsed} />

        {!collapsed && (
          <div className="px-5 mb-2">
            <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase" style={{ color: 'var(--text3)' }}>
              Navigation
            </span>
          </div>
        )}

        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_ITEMS.map((item, i) => {
            const active = pathname === item.href || (item.href !== '/studies' && pathname.startsWith(item.href));
            return (
              <Link
                key={i}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-[#5A6B85] hover:text-white hover:bg-[#0C1728]'
                }`}
                style={active ? { background: 'var(--navy2)' } : {}}
              >
                <span className="flex-shrink-0">{ICONS[item.icon]}</span>
                {!collapsed && (
                  <>
                    <span className="text-[13px] flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className="font-mono text-[10px] px-1.5 py-0.5"
                        style={{
                          background: item.badgeColor === 'red' ? 'rgba(224,60,60,.15)' : 'rgba(61,142,255,.12)',
                          color: item.badgeColor === 'red' ? '#E03C3C' : '#3D8EFF',
                          borderRadius: '2px',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}

          <div className="my-3 mx-3" style={{ borderTop: '1px solid #122038' }} />

          {[
            { label: 'Settings', icon: 'settings', href: '#' },
            { label: 'Help', icon: 'help', href: '#' },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-[#5A6B85] hover:text-white hover:bg-[#0C1728] transition-colors"
            >
              <span className="flex-shrink-0">{ICONS[item.icon]}</span>
              {!collapsed && <span className="text-[13px]">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="px-5 py-4 text-[#5A6B85] hover:text-white transition-colors text-left"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}>
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
        </button>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarW }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-6"
          style={{ height: 58, background: 'var(--white)', borderBottom: '1px solid var(--border)' }}
        >
          <span className="font-mono text-[12.5px]" style={{ color: 'var(--text2)' }}>
            AdaptiView / {pathname.replace(/\//g, ' / ').replace(/^ \/ /, '')}
          </span>

          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search studies, patients, AEs..."
              className="font-sans text-[13px] px-3"
              style={{
                height: 34,
                border: '1px solid var(--border)',
                borderRadius: 0,
                background: 'var(--white)',
                color: 'var(--text)',
                width: 260,
                outline: 'none',
              }}
            />

            {/* Bell */}
            <div className="relative cursor-pointer" style={{ color: 'var(--text3)' }}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
              </svg>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: 'var(--red)' }} />
            </div>

            {/* User pill */}
            <div className="flex items-center gap-2 pl-3" style={{ borderLeft: '1px solid var(--border)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-mono font-medium" style={{ background: 'var(--accent)' }}>
                WB
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>W. Brooks</span>
                <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>REVIEWER</span>
              </div>
            </div>
          </div>
        </header>

        {/* Accent gradient line */}
        <div style={{ height: 2, background: 'linear-gradient(to right, #3D8EFF, #00D4FF)', opacity: 0.4 }} />

        {/* Cognitive mode indicator */}
        {adaptationMode && (
          <div
            className="flex items-center gap-2 px-6 py-2"
            style={{
              background: 'rgba(61,142,255,0.05)',
              borderBottom: '1px solid rgba(61,142,255,0.15)',
            }}
          >
            <svg viewBox="0 0 32 32" fill="none" width="14" height="14">
              <path d="M2 16 C7 9,25 9,30 16 C25 23,7 23,2 16Z" stroke="#3D8EFF" strokeWidth="1.4" fill="none" opacity=".85"/>
              <circle cx="16" cy="16" r="2" fill="#3D8EFF"/>
            </svg>
            <span className="font-mono text-[10px] tracking-[0.04em]" style={{ color: 'var(--accent)' }}>
              Adapting to your {adaptationMode} profile
              {sessionCount ? ` \u00b7 Session ${sessionCount}` : ''}
              {confidence ? ` \u00b7 ${Math.round(confidence * 100)}% confidence` : ''}
            </span>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          </div>
        )}

        {/* Content */}
        <main className="flex-1 p-6" style={{ minWidth: 0, overflow: 'hidden' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
