'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerCompany, OwnerContact, OwnerLead, OwnerPage } from '../lib/owner-contracts';

type Tab = 'companies' | 'contacts' | 'leads';
type RecordItem = OwnerCompany | OwnerContact | OwnerLead;
const config: Record<Tab, { label: string; endpoint: string; sort: string; search: boolean }> = {
  companies: { label: 'Companies', endpoint: '/api/owner-workspace/crm/companies', sort: 'name:asc', search: true },
  contacts: { label: 'Contacts', endpoint: '/api/owner-workspace/crm/contacts', sort: 'name:asc', search: true },
  leads: { label: 'Leads', endpoint: '/api/owner-workspace/crm/leads', sort: 'created_at:desc', search: false },
};

function Detail({ value }: { value: RecordItem | null }) {
  if (!value) return <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Record details</h2><p className="mt-2 text-sm text-slate-400">Select a record to view its safe details.</p></aside>;
  return <aside aria-live="polite" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Record details</h2><dl className="mt-4 space-y-3 text-sm">{Object.entries(value).filter(([key, entry]) => key !== 'id' && entry !== null).map(([key, entry]) => <div key={key}><dt className="text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="break-words text-slate-100">{String(entry)}</dd></div>)}</dl></aside>;
}

export default function OwnerCrmWorkspace() {
  const { request } = useOwnerWorkspace();
  const [tab, setTab] = useState<Tab>('companies');
  const [query, setQuery] = useState(''); const [appliedQuery, setAppliedQuery] = useState('');
  const [sort, setSort] = useState(config.companies.sort); const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<OwnerPage<RecordItem> | null>(null); const [detail, setDetail] = useState<RecordItem | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setDetail(null);
    try { const params = new URLSearchParams({ limit: '20', sort }); if (appliedQuery) params.set('q', appliedQuery); if (cursor) params.set('cursor', cursor); const body = await request<ApiBody<OwnerPage<RecordItem>>>(`${config[tab].endpoint}?${params}`); setPage(body.data); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load CRM records.'); }
    finally { setLoading(false); }
  }, [appliedQuery, cursor, request, sort, tab]);

  useEffect(() => { void load(); }, [load]);
  function switchTab(next: Tab) { setTab(next); setSort(config[next].sort); setCursor(null); setAppliedQuery(''); setQuery(''); }
  async function showDetail(id: string) { try { setError(''); const body = await request<ApiBody<RecordItem>>(`${config[tab].endpoint}/${id}`); setDetail(body.data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load record details.'); } }

  return <section><header className="mb-7"><p className="text-sm font-medium text-cyan-300">CRM</p><h1 className="mt-1 text-3xl font-semibold">Companies, contacts, and leads</h1><p className="mt-2 text-sm text-slate-300">Bounded records scoped to your authenticated workspace.</p></header>
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="CRM records">{(Object.keys(config) as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => switchTab(item)} className={`rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-300 ${tab === item ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{config[item].label}</button>)}</div>
    <form className="mb-5 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setCursor(null); setAppliedQuery(query.trim()); }}>{config[tab].search && <label className="text-sm">Search <input aria-label={`Search ${config[tab].label}`} value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>}<label className="text-sm">Sort <select value={sort} onChange={(event) => { setCursor(null); setSort(event.target.value); }} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">{tab !== 'leads' && <option value="name:asc">Name</option>}<option value="created_at:desc">Newest</option></select></label><button className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Apply</button></form>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><section aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800" />)}</div> : !page?.items.length ? <p className="p-5 text-sm text-slate-300">No {config[tab].label.toLowerCase()} match the selected filters.</p> : <ul className="divide-y divide-slate-800">{page.items.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium text-white">{'name' in item ? item.name : `Lead for contact ${item.contact_id}`}</p><p className="mt-1 text-xs text-slate-400">{item.created_at}</p></div><button onClick={() => void showDetail(item.id)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">View details</button></li>)}</ul>}<div className="flex justify-end border-t border-slate-800 p-4">{page?.pageInfo.hasNextPage && <button onClick={() => setCursor(page.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next page</button>}</div></section><Detail value={detail} /></div>
  </section>;
}
