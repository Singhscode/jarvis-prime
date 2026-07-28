'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerEmployee, OwnerEmployeeInvitation, OwnerEmployeeInvitationInput, OwnerPage } from '../lib/owner-contracts';

export default function OwnerEmployeesWorkspace() {
  const { request } = useOwnerWorkspace();
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sort, setSort] = useState('name:asc');
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<OwnerPage<OwnerEmployee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<OwnerEmployeeInvitationInput>({ full_name: '', email: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '20', sort });
      if (appliedQuery) params.set('q', appliedQuery);
      if (cursor) params.set('cursor', cursor);
      const body = await request<ApiBody<OwnerPage<OwnerEmployee>>>(`/api/owner-workspace/employees?${params}`);
      setPage(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, cursor, request, sort]);

  useEffect(() => { void load(); }, [load]);

  async function inviteEmployee() {
    setInviting(true);
    setInviteError('');
    setInviteMessage('');
    try {
      const body = await request<ApiBody<{ invitation: OwnerEmployeeInvitation }>>('/api/owner-workspace/employees/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      });
      if (body.data.invitation.status !== 'pending') throw new Error('Invitation could not be issued.');
      setInvite({ full_name: '', email: '' });
      setInviteMessage('Employee invitation sent. The employee must activate their own access.');
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : 'Unable to invite employee.');
    } finally {
      setInviting(false);
    }
  }

  return <section>
    <header className="mb-7">
      <p className="text-sm font-medium text-cyan-300">Employees</p>
      <h1 className="mt-1 text-3xl font-semibold">Employee directory</h1>
      <p className="mt-2 text-sm text-slate-300">Invite employees securely, then oversee active assignments and workload.</p>
    </header>
    <form id="invite-employee" className="mb-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5" onSubmit={(event) => { event.preventDefault(); void inviteEmployee(); }}>
      <h2 className="text-lg font-semibold text-white">Invite employee</h2>
      <p className="mt-2 text-sm text-slate-300">The employee receives a single-use activation link and chooses their own password.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Full name<input aria-label="Employee full name" required maxLength={120} autoComplete="name" value={invite.full_name} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>
        <label className="text-sm">Email<input aria-label="Employee email" required type="email" maxLength={320} autoComplete="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>
      </div>
      <button disabled={inviting} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-cyan-200">{inviting ? 'Sending invitation…' : 'Invite employee'}</button>
      {inviteMessage && <p role="status" className="mt-3 text-sm text-emerald-200">{inviteMessage}</p>}
      {inviteError && <p role="alert" className="mt-3 text-sm text-red-200">{inviteError}</p>}
    </form>
    <form className="mb-5 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setCursor(null); setAppliedQuery(query.trim()); }}>
      <label className="text-sm">Search <input aria-label="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>
      <label className="text-sm">Sort <select value={sort} onChange={(event) => { setCursor(null); setSort(event.target.value); }} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="email:asc">Email A–Z</option></select></label>
      <button className="rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">Apply</button>
    </form>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    <section aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
      {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800" />)}</div> : !page?.items.length ? <p className="p-5 text-sm text-slate-300">No active employees match the selected filters.</p> : <ul className="divide-y divide-slate-800">{page.items.map((employee) => <li key={employee.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium text-white">{employee.fullName || employee.email}</p><p className="mt-1 text-sm text-slate-400">{employee.email} · {employee.workload.open} open, {employee.workload.completed} completed tasks</p></div><Link href={`/dashboard/employees/${employee.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">View employee</Link></li>)}</ul>}
      <div className="flex justify-end border-t border-slate-800 p-4">{page?.pageInfo.hasNextPage && <button onClick={() => setCursor(page.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">Next page</button>}</div>
    </section>
  </section>;
}
