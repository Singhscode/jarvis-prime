'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import OwnerProjectCreationDialog from './OwnerProjectCreationDialog';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerPage, OwnerProject } from '../lib/owner-contracts';

export default function OwnerProjectsWorkspace() {
  const { request } = useOwnerWorkspace();
  const [query, setQuery] = useState(''); const [clientId, setClientId] = useState(''); const [appliedQuery, setAppliedQuery] = useState(''); const [appliedClientId, setAppliedClientId] = useState('');
  const [sort, setSort] = useState('name:asc'); const [cursor, setCursor] = useState<string | null>(null); const [page, setPage] = useState<OwnerPage<OwnerProject> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const params = new URLSearchParams({ limit: '20', sort }); if (appliedQuery) params.set('q', appliedQuery); if (appliedClientId) params.set('client_id', appliedClientId); if (cursor) params.set('cursor', cursor); const body = await request<ApiBody<OwnerPage<OwnerProject>>>(`/api/owner-workspace/projects?${params}`); setPage(body.data); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load projects.'); }
    finally { setLoading(false); }
  }, [appliedClientId, appliedQuery, cursor, request, sort]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (window.location.hash === '#new-project') { setProjectDialogOpen(true); window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); }
    if (window.location.hash === '#new-task') { setNotice('Choose a project, then use its existing Create task workflow.'); window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); }
  }, []);
  function projectCreated() { setProjectDialogOpen(false); setNotice('Project created.'); void load(); }
  return <section><header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-cyan-300">Projects</p><h1 className="mt-1 text-3xl font-semibold">Project overview</h1><p className="mt-2 text-sm text-slate-300">Projects are scoped to your authenticated workspace and their assigned client.</p></div><button onClick={() => setProjectDialogOpen(true)} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100">New project</button></header>
    <form className="mb-5 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setCursor(null); setAppliedQuery(query.trim()); setAppliedClientId(clientId.trim()); }}><label className="text-sm">Search <input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Client ID filter <input aria-label="Project client ID filter" value={clientId} onChange={(event) => setClientId(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Sort <select value={sort} onChange={(event) => { setCursor(null); setSort(event.target.value); }} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option></select></label><button className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Apply</button></form>
    {notice && <p role="status" className="mb-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}{error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    <section aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800" />)}</div> : !page?.items.length ? <p className="p-5 text-sm text-slate-300">No projects match the selected filters.</p> : <ul className="divide-y divide-slate-800">{page.items.map((project) => <li key={project.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium text-white">{project.name}</p><p className="mt-1 text-sm text-slate-400">Client: {project.client?.name || 'Unavailable'}</p><p className="mt-1 text-xs text-slate-500">{project.progress.reason}</p></div><Link href={`/dashboard/projects/${project.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">View project</Link></li>)}</ul>}<div className="flex justify-end border-t border-slate-800 p-4">{page?.pageInfo.hasNextPage && <button onClick={() => setCursor(page.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next page</button>}</div></section>
    <OwnerProjectCreationDialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} onCreated={projectCreated} />
  </section>;
}
