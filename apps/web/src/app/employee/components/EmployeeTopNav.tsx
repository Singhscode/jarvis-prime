'use client';
/* eslint-disable @next/next/no-img-element */

type Props = { dark: boolean; onThemeToggle: () => void; onRefresh: () => void; onLogout: () => void };

export default function EmployeeTopNav({ dark, onThemeToggle, onRefresh, onLogout }: Props) {
  return <header className="sticky top-0 z-20 border-b border-[var(--workspace-border)] bg-[var(--workspace-bg)]/95 backdrop-blur">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3"><img src="/logo-white.svg" alt="JARVIS PRIME" className={`h-7 w-auto ${dark ? '' : 'invert'}`} /><span className="border-l border-[var(--workspace-border)] pl-3 text-xs font-medium sm:text-sm">Employee Workspace</span></div>
      <div className="flex items-center gap-2">
        <button aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} aria-pressed={!dark} onClick={onThemeToggle} className="rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--workspace-surface)] focus:outline-none focus:ring-2 focus:ring-cyan-400">{dark ? 'Light' : 'Dark'}</button>
        <button onClick={onRefresh} className="rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--workspace-surface)] focus:outline-none focus:ring-2 focus:ring-cyan-400">Refresh</button>
        <button onClick={onLogout} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400">Log out</button>
      </div>
    </div>
  </header>;
}