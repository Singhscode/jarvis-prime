'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';

type Run = { id: string; workflow: 'workspace_summary'; status: 'pending' | 'running' | 'completed' | 'failed'; logs: { at: string; message: string }[]; result: { generatedAt: string | null; metrics: { label: string; value: number }[] } | null };

export default function OwnerAutomationWorkspace() {
  const { request, refresh } = useOwnerWorkspace();
  const [run, setRun] = useState<Run | null>(null); const [starting, setStarting] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (runId: string) => {
    try { const body = await request<{ success: true; data: Run }>(`/api/owner-workspace/automation-runs/${runId}`); setRun(body.data); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load automation status.'); }
  }, [request]);
  useEffect(() => { if (window.location.hash === '#run-automation') { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); } }, []);
  useEffect(() => {
    if (!run || !['pending', 'running'].includes(run.status)) return;
    const timer = window.setInterval(() => { void load(run.id); }, 1_500);
    return () => window.clearInterval(timer);
  }, [load, run]);
  async function start() {
    setStarting(true); setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const body = await request<{ success: true; data: Run }>('/api/owner-workspace/automation-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ workflow: 'workspace_summary' }),
      });
      setRun(body.data); refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to start automation.'); }
    finally { setStarting(false); }
  }
  return <section><header className="mb-7"><p className="text-sm font-medium text-cyan-300">Automation</p><h1 className="mt-1 text-3xl font-semibold">Owner automation runner</h1><p className="mt-2 text-sm text-slate-300">Only the approved workspace-summary workflow is available. It refreshes your scoped metrics and cannot send outreach, change scheduler state, or access provider credentials.</p></header><div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Refresh workspace summary</h2><p className="mt-2 text-sm text-slate-300">Creates a redacted snapshot of active employee and task counts for your authenticated workspace.</p><button disabled={starting || run?.status === 'pending' || run?.status === 'running'} onClick={() => void start()} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">{starting || run?.status === 'pending' || run?.status === 'running' ? 'Running…' : 'Run automation'}</button>{error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}</div>{run && <section aria-live="polite" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Latest run</h2><p className="mt-2 text-sm text-slate-300">Status: <strong className="capitalize">{run.status}</strong></p><ul className="mt-4 space-y-2 text-sm text-slate-300">{run.logs.map((entry) => <li key={`${entry.at}:${entry.message}`}><time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString()}</time> · {entry.message}</li>)}</ul>{run.result && <dl className="mt-4 grid gap-2 sm:grid-cols-3">{run.result.metrics.map((metric) => <div key={metric.label} className="rounded-lg border border-slate-700 p-3"><dt className="text-xs text-slate-400">{metric.label}</dt><dd className="mt-1 font-semibold">{metric.value}</dd></div>)}</dl>}</section>}</section>;
}
