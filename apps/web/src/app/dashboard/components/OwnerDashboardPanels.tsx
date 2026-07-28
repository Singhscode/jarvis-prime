import Link from 'next/link';
import type { OwnerDashboard, SourceState } from '../lib/owner-contracts';

type Props = { dashboard: OwnerDashboard | null; loading: boolean; error: string; onRetry: () => void };

function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}

function MetricCard({ metric }: { metric: SourceState }) {
  const unavailable = metric.status !== 'available';
  return <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <p className="text-sm font-medium text-slate-300">{metric.label}</p>
    <p className="mt-3 text-3xl font-semibold text-white">{unavailable ? 'Unavailable' : metric.value}</p>
    <p className="mt-3 text-xs text-slate-400">{metric.window} · {metric.source}</p>
    <p className="mt-1 text-xs text-slate-500">As of <Timestamp value={metric.asOf} /></p>
    {metric.reason && <p className="mt-2 text-xs text-amber-200">{metric.reason}</p>}
  </article>;
}

function SourcePanel({ title, state, emptyMessage, id }: { title: string; state: SourceState & { items: [] }; emptyMessage: string; id: string }) {
  return <section aria-labelledby={`${id}-heading`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <h2 id={`${id}-heading`} className="text-lg font-semibold text-white">{title}</h2>
    {state.status === 'available' && state.items.length === 0
      ? <p className="mt-4 text-sm text-slate-300">{emptyMessage}</p>
      : <p className="mt-4 text-sm text-slate-300">{state.reason || 'This source is unavailable.'}</p>}
    <p className="mt-3 text-xs text-slate-500">Source: {state.source} · as of <Timestamp value={state.asOf} /></p>
  </section>;
}

function QuickActions() {
  const actions = [
    { label: 'Create Company', href: '/dashboard/crm#create-company' },
    { label: 'Create Contact', href: '/dashboard/crm#create-contact' },
    { label: 'Create Lead', href: '/dashboard/crm#create-lead' },
    { label: 'Convert lead / Client', href: '/dashboard/clients#convert-lead' },
    { label: 'Create Project', href: '/dashboard/projects#create-project' },
    { label: 'Create Task', href: '/dashboard/tasks#create-task' },
    { label: 'Upload Document', href: '/dashboard/documents#upload-document' },
    { label: 'Create Employee', href: '/dashboard/employees#invite-employee' },
  ];
  return <section aria-labelledby="quick-actions-heading" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <h2 id="quick-actions-heading" className="text-lg font-semibold text-white">Quick actions</h2>
    <p className="mt-2 text-sm text-slate-300">Open the same scoped forms used by each workspace.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{actions.map((action) => <Link key={action.label} href={action.href} className="rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">{action.label}</Link>)}<button disabled className="rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-slate-500 disabled:cursor-not-allowed" aria-describedby="quick-actions-note">Run Automation<span className="ml-2 text-xs">Unavailable</span></button></div>
    <p id="quick-actions-note" className="mt-3 text-xs text-slate-500">No quick action bypasses a scoped business workflow.</p>
  </section>;
}

export default function OwnerDashboardPanels({ dashboard, loading, error, onRetry }: Props) {
  if (loading && !dashboard) return <section aria-busy="true" aria-label="Loading dashboard" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-900" />)}</section>;
  if (error) return <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 p-5"><h2 className="font-semibold text-red-100">Dashboard data is unavailable</h2><p className="mt-2 text-sm text-red-200">{error}</p><button onClick={onRetry} className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-950 focus:outline-none focus:ring-2 focus:ring-red-200">Try again</button></section>;
  if (!dashboard) return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold text-white">Nothing to show yet</h2><p className="mt-2 text-sm text-slate-300">The dashboard summary has no available source.</p></section>;
  return <>
    <section aria-label="Key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{dashboard.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>
    <section className="mt-6 grid gap-6 lg:grid-cols-2"><SourcePanel id="attention" title="Attention" state={dashboard.attention} emptyMessage="No active attention items." /><SourcePanel id="recent-activity" title="Recent activity" state={dashboard.recentActivity} emptyMessage="No recent activity." /></section>
    <section className="mt-6 grid gap-6 lg:grid-cols-2"><QuickActions /><section aria-labelledby="health-heading" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 id="health-heading" className="text-lg font-semibold text-white">System health</h2><p className="mt-4 text-sm text-slate-300">{dashboard.health.reason || 'No health information is available.'}</p><p className="mt-3 text-xs text-slate-500">Source: {dashboard.health.source} · as of <Timestamp value={dashboard.health.asOf} /></p></section></section>
  </>;
}
