'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerClient, OwnerPage } from '../lib/owner-contracts';

export default function OwnerClientsWorkspace() {
  const { request } = useOwnerWorkspace();
  const [query, setQuery] = useState(''); const [appliedQuery, setAppliedQuery] = useState('');
  const [sort, setSort] = useState('name:asc'); const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<OwnerPage<OwnerClient> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const params = new URLSearchParams({ limit: '20', sort }); if (appliedQuery) params.set('q', appliedQuery); if (cursor) params.set('cursor', cursor); const body = await request<ApiBody<OwnerPage<OwnerClient>>>(`/api/owner-workspace/clients?${params}`); setPage(body.data); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load clients.'); }
    finally { setLoading(false); }
  }, [appliedQuery, cursor, request, sort]);
  useEffect(() => { void load(); }, [load]);

  return <section><header className="mb-7"><p className="text-sm font-medium text-cyan-300">Clients</p><h1 className="mt-1 text-3xl font-semibold">Client management</h1><p className="mt-2 text-sm text-slate-300">Client records and Client Portal administration remain securely separated.</p></header>
    <form className="mb-5 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setCursor(null); setAppliedQuery(query.trim()); }}><label className="text-sm">Search <input aria-label="Search clients" value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Sort <select value={sort} onChange={(event) => { setCursor(null); setSort(event.target.value); }} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="name:asc">Name</option><option value="created_at:desc">Newest</option></select></label><button className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Apply</button></form>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    <section aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800" />)}</div> : !page?.items.length ? <p className="p-5 text-sm text-slate-300">No clients match the selected filters.</p> : <ul className="divide-y divide-slate-800">{page.items.map((client) => <li key={client.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium text-white">{client.name}</p><p className="mt-1 text-xs text-slate-400">Created {client.created_at}</p></div><Link href={`/dashboard/clients/${client.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">View client</Link></li>)}</ul>}<div className="flex justify-end border-t border-slate-800 p-4">{page?.pageInfo.hasNextPage && <button onClick={() => setCursor(page.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next page</button>}</div></section>
  </section>;
}
