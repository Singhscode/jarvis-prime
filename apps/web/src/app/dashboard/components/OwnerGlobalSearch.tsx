'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerSearch } from '../lib/owner-contracts';

export default function OwnerGlobalSearch() {
  const { request } = useOwnerWorkspace(); const [q, setQ] = useState(''); const [result, setResult] = useState<OwnerSearch | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function search(event: FormEvent) { event.preventDefault(); if (!q.trim()) return; setLoading(true); setError(''); try { const body = await request<ApiBody<OwnerSearch>>(`/api/owner-workspace/search?q=${encodeURIComponent(q.trim())}`); setResult(body.data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Search is unavailable.'); } finally { setLoading(false); } }
  return <details className="relative"><summary className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">Search workspace</summary><section aria-label="Global search" className="absolute right-0 z-50 mt-2 w-[min(32rem,90vw)] rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl"><form onSubmit={(event) => void search(event)} className="flex gap-2"><label className="sr-only" htmlFor="owner-global-search">Search workspace records</label><input id="owner-global-search" value={q} onChange={(event) => setQ(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1" /><button disabled={loading} className="rounded bg-cyan-300 px-3 py-1 text-slate-950 disabled:opacity-60">Search</button></form>{error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}{result && <div className="mt-4 max-h-80 overflow-auto">{result.groups.map((group) => <section key={group.type} className="mb-3"><h2 className="text-sm font-semibold capitalize">{group.type}</h2>{group.status === 'unavailable' ? <p className="text-sm text-slate-400">{group.reason}</p> : !group.items.length ? <p className="text-sm text-slate-400">No matches.</p> : <ul>{group.items.map((item) => <li key={item.id}><Link href={item.href} className="text-sm text-cyan-300 hover:underline">{item.label}{item.detail ? ` · ${item.detail}` : ''}</Link></li>)}</ul>}</section>)}</div>}</section></details>;
}
