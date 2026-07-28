'use client';

import { useState, type CSSProperties } from 'react';
import EmployeeTopNav from './EmployeeTopNav';
import SummaryCards from './SummaryCards';
import TaskList from './TaskList';

type Props = {
  snapshot: {
    projects: { id: string; client_id: string; name: string }[];
    tasks: { id: string; project_id: string; name: string; completed: boolean }[];
    clients: { id: string; name: string; created_at: string }[];
    leads: { id: string; contact_id: string; created_at: string }[];
  } | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onLogout: () => void;
  onTaskChange: (
    task: { id: string; project_id: string; name: string; completed: boolean },
    justification: string,
  ) => Promise<void>;
};

export default function EmployeeWorkspace({
  snapshot,
  loading,
  error,
  onRefresh,
  onLogout,
  onTaskChange,
}: Props) {
  const [dark, setDark] = useState(true);
  const theme = {
    '--workspace-bg': dark ? '#030712' : '#f8fafc',
    '--workspace-surface': dark ? '#0f172a' : '#ffffff',
    '--workspace-card': dark ? '#111827' : '#f8fafc',
    '--workspace-text': dark ? '#f1f5f9' : '#0f172a',
    '--workspace-muted': dark ? '#94a3b8' : '#64748b',
    '--workspace-border': dark ? 'rgba(148,163,184,.16)' : 'rgba(15,23,42,.12)',
  } as CSSProperties;

  if (!snapshot && loading) {
    return <main
      style={theme}
      className="min-h-screen bg-[var(--workspace-bg)] p-5 sm:p-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-16 rounded-2xl bg-[var(--workspace-surface)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <div className="h-24 rounded-2xl bg-[var(--workspace-surface)]" key={index} />)}
        </div>
        <div className="h-80 rounded-2xl bg-[var(--workspace-surface)]" />
      </div>
    </main>;
  }


  return <main
    style={theme}
    className="min-h-screen bg-[var(--workspace-bg)] text-[var(--workspace-text)]"
  >
    <EmployeeTopNav
      dark={dark}
      onThemeToggle={() => setDark((value) => !value)}
      onRefresh={onRefresh}
      onLogout={onLogout}
    />
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section id="overview" className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-400">Employee Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your work overview</h1>
          <p className="mt-2 text-sm text-[var(--workspace-muted)]">Everything assigned to you, in one focused view.</p>
        </div>
        <p className="text-sm text-[var(--workspace-muted)]">{loading ? 'Refreshing workspace…' : 'Workspace up to date'}</p>
      </section>
      {error && <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
        <strong>We couldn’t update your workspace.</strong> {error}{' '}
        <button onClick={onRefresh} className="underline decoration-cyan-400 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-cyan-400">Try again</button>
      </div>}
      {!snapshot ? <section className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-6 text-center">
        <h2 className="text-lg font-semibold">Workspace unavailable</h2>
        <p className="mt-2 text-sm text-[var(--workspace-muted)]">Try refreshing to load your assigned work.</p>
        <button onClick={onRefresh} className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-400">Refresh workspace</button>
      </section> : <>
        <SummaryCards
          projects={snapshot.projects.length}
          openTasks={snapshot.tasks.filter((task) => !task.completed).length}
          completedTasks={snapshot.tasks.filter((task) => task.completed).length}
          clients={snapshot.clients.length}
          leads={snapshot.leads.length}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
          <TaskList tasks={snapshot.tasks} projects={snapshot.projects} onTaskChange={onTaskChange} />
          <div className="space-y-6">
            <section id="projects" className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5">
              <h2 className="text-lg font-semibold">Assigned projects</h2>
              <div className="mt-4 space-y-3">
                {snapshot.projects.length ? snapshot.projects.map((project) => <article className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-card)] p-4" key={project.id}>
                  <h3 className="font-medium">{project.name}</h3><p className="mt-1 text-sm text-[var(--workspace-muted)]">Assigned project</p>
                </article>) : <p className="text-sm text-[var(--workspace-muted)]">No assigned projects.</p>}
              </div>
            </section>
            <section id="clients" className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5">
              <h2 className="text-lg font-semibold">Clients</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {snapshot.clients.length ? snapshot.clients.map((client) => <article className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-card)] p-4" key={client.id}>
                  <h3 className="font-medium">{client.name}</h3><p className="mt-1 text-sm text-[var(--workspace-muted)]">Client record</p>
                </article>) : <p className="text-sm text-[var(--workspace-muted)]">No assigned clients.</p>}
              </div>
            </section>
            <section id="leads" className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5">
              <h2 className="text-lg font-semibold">Leads</h2>
              <div className="mt-4 space-y-3">
                {snapshot.leads.length ? snapshot.leads.map((lead) => <article className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-card)] p-4" key={lead.id}>
                  <h3 className="font-medium">Lead record</h3><p className="mt-1 text-sm text-[var(--workspace-muted)]">Added {new Date(lead.created_at).toLocaleDateString()}</p>
                </article>) : <p className="text-sm text-[var(--workspace-muted)]">No assigned leads.</p>}
              </div>
            </section>
          </div>
        </div>
      </>}
    </div>
  </main>;
}
