'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody } from '../lib/owner-contracts';
import type { AnalyticsDashboard } from '../lib/analytics-contracts';

function money(minor: number, currencyCode: string) {
  return `${currencyCode} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function analyticsError(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

export default function OwnerAnalyticsWorkspace() {
  const { request } = useOwnerWorkspace();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = await request<ApiBody<AnalyticsDashboard>>('/api/analytics/dashboard');
      setDashboard(body.data);
    } catch (caught) {
      setError(analyticsError(caught, 'Unable to load Analytics.'));
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => { void load(); }, [load]);

  if (loading && !dashboard) {
    return <section aria-busy="true" aria-label="Loading analytics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-900" />)}
    </section>;
  }
  if (error) {
    return <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 p-5">
      <h2 className="font-semibold text-red-100">Analytics is unavailable</h2>
      <p className="mt-2 text-sm text-red-200">{error}</p>
      <button onClick={() => void load()} className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-950 focus:outline-none focus:ring-2 focus:ring-red-200">Try again</button>
    </section>;
  }
  if (!dashboard) {
    return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-lg font-semibold text-white">Nothing to show yet</h2>
      <p className="mt-2 text-sm text-slate-300">Analytics has no available data.</p>
    </section>;
  }

  const { overview, activity24h } = dashboard;
  const cards = [
    { label: 'Revenue (last 90 days)', value: money(overview.revenue.totalMinor, overview.revenue.currencyCode) },
    { label: 'Clients', value: String(overview.clients) },
    { label: 'Active clients (90d)', value: String(overview.activeClients) },
    { label: 'New clients this month', value: String(overview.newClientsThisMonth) },
    { label: 'Projects', value: String(overview.projects) },
    { label: 'Task completion rate', value: `${overview.tasks.completionRate}% (${overview.tasks.completed}/${overview.tasks.total})` },
    { label: 'Leads', value: String(overview.leads) },
    { label: 'Approved expenses', value: money(overview.expenses.totalMinor, overview.revenue.currencyCode) },
  ];

  return <section>
    <header className="mb-7">
      <p className="text-sm font-medium text-cyan-300">Overview</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Analytics</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">A snapshot of revenue, clients, and delivery activity computed live from your account data. Owner-only for now.</p>
    </header>
    <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => <article key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <p className="text-sm font-medium text-slate-300">{card.label}</p>
        <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
      </article>)}
    </section>
    <section aria-labelledby="activity-heading" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 id="activity-heading" className="text-lg font-semibold text-white">Last 24 hours</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-slate-400">Messages sent</dt><dd className="mt-1 text-xl font-semibold text-white">{activity24h.messagesSent}</dd></div>
        <div><dt className="text-sm text-slate-400">Threads created</dt><dd className="mt-1 text-xl font-semibold text-white">{activity24h.threadsCreated}</dd></div>
        <div><dt className="text-sm text-slate-400">Automation runs</dt><dd className="mt-1 text-xl font-semibold text-white">{activity24h.automationRuns.completed} completed · {activity24h.automationRuns.failed} failed</dd></div>
      </dl>
    </section>
    <p className="mt-4 text-xs text-slate-500">Generated at {new Date(dashboard.generatedAt).toLocaleString()}</p>
  </section>;
}
