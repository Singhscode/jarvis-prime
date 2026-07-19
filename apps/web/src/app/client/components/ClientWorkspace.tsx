'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';

type Snapshot = {
  client: { id: string; name: string };
  projects: { id: string; name: string }[];
  tasks: { id: string; project_id: string; name: string; completed: boolean }[];
  documents: { id: string; project_id: string | null; title: string; document_type: string; created_at: string }[];
};
type Props = {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onLogout: () => void;
  onDocumentDownload: (documentId: string) => Promise<void>;
};

export default function ClientWorkspace({
  snapshot, loading, error, onRefresh, onLogout, onDocumentDownload,
}: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const projectNames = new Map(snapshot?.projects.map((project) => [project.id, project.name]));
  const hasContent = Boolean(snapshot && (snapshot.projects.length || snapshot.tasks.length || snapshot.documents.length));

  async function download(documentId: string) {
    setDownloadingId(documentId);
    try { await onDocumentDownload(documentId); } finally { setDownloadingId(null); }
  }

  if (!snapshot && loading) {
    return <main className="min-h-screen bg-slate-950 p-5 text-slate-100 sm:p-8" aria-busy="true">
      <div className="mx-auto max-w-6xl animate-pulse space-y-6"><div className="h-16 rounded-2xl bg-slate-900" /><div className="h-32 rounded-2xl bg-slate-900" /><div className="h-80 rounded-2xl bg-slate-900" /></div>
    </main>;
  }

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-20 border-b border-slate-700/60 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><img src="/logo-white.svg" alt="JARVIS PRIME" className="h-7 w-auto" /><span className="border-l border-slate-700 pl-3 text-sm font-medium">Client Portal</span></div>
        <div className="flex gap-2"><button onClick={onRefresh} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-60">Refresh</button><button onClick={onLogout} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400">Log out</button></div>
      </div>
    </header>
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-cyan-400">Client Portal</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{snapshot?.client.name || 'Your workspace'}</h1><p className="mt-2 text-sm text-slate-400">A focused view of your approved projects, tasks, and documents.</p></div>
        <p className="text-sm text-slate-400" aria-live="polite">{loading ? 'Refreshing workspace…' : 'Workspace up to date'}</p>
      </section>
      {error && <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100"><strong>We couldn’t update your workspace.</strong> {error} <button onClick={onRefresh} className="underline decoration-cyan-400 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-cyan-400">Try again</button></div>}
      {!snapshot ? <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center"><h2 className="text-lg font-semibold">Workspace unavailable</h2><p className="mt-2 text-sm text-slate-400">Try refreshing or contact your account owner for support.</p><button onClick={onRefresh} className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-400">Refresh workspace</button></section> : <>
        {!hasContent && <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center"><h2 className="text-lg font-semibold">Nothing is available yet</h2><p className="mt-2 text-sm text-slate-400">Projects, tasks, and approved documents will appear here. Contact your account owner if you need help.</p></section>}
        {snapshot.projects.length > 0 && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><p className="text-sm font-medium text-cyan-400">Projects</p><h2 className="mt-1 text-xl font-semibold">Active work</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{snapshot.projects.map((project) => <article key={project.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4"><h3 className="font-medium">{project.name}</h3><p className="mt-1 text-sm text-slate-400">Client project</p></article>)}</div></section>}
        {snapshot.tasks.length > 0 && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-cyan-400">Tasks</p><h2 className="mt-1 text-xl font-semibold">Work progress</h2></div><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm font-medium text-cyan-300">{snapshot.tasks.filter((task) => !task.completed).length} open</span></div><ul className="mt-5 divide-y divide-slate-700">{snapshot.tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-4 py-4"><div><p className={`font-medium ${task.completed ? 'text-slate-400 line-through' : ''}`}>{task.name}</p><p className="mt-1 text-sm text-slate-400">{projectNames.get(task.project_id) || 'Project'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.completed ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>{task.completed ? 'Completed' : 'Open'}</span></li>)}</ul></section>}
        {snapshot.documents.length > 0 && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><p className="text-sm font-medium text-cyan-400">Documents</p><h2 className="mt-1 text-xl font-semibold">Approved files</h2><div className="mt-5 space-y-3">{snapshot.documents.map((document) => <article key={document.id} className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-medium">{document.title}</h3><p className="mt-1 text-sm text-slate-400">{document.document_type} · {new Date(document.created_at).toLocaleDateString()}</p></div><button onClick={() => void download(document.id)} disabled={downloadingId === document.id} className="rounded-lg border border-cyan-400/50 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-60">{downloadingId === document.id ? 'Preparing…' : 'Download'}</button></article>)}</div></section>}
      </>}
    </div>
  </main>;
}
