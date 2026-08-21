'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, ClientAccountEmailEligibility, OwnerClient, OwnerPage } from '../lib/owner-contracts';

type ClientAccountForm = { name: string; contact_name: string; email: string; phone: string };
type LoadOptions = { query?: string; sort?: string; cursor?: string | null };
type ProvisionedClient = { client: { id: string; clientCode: string; name: string }; delivery: { status: 'sent' | 'dry_run' | 'failed'; expiresAt: string } };

const emptyClientAccountForm: ClientAccountForm = { name: '', contact_name: '', email: '', phone: '' };
const clientAccountEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function eligibilityMessage(eligibility: ClientAccountEmailEligibility['eligibility']) {
  if (eligibility === 'available') return 'This email can receive a new invitation.';
  if (eligibility === 'resend_available') return 'An existing pending invitation will be replaced when you send this invitation.';
  if (eligibility === 'owner_crm_email_exists') return 'This email is already used by a Client or contact in your workspace.';
  if (eligibility === 'existing_client') return 'This email already has a Client account.';
  return 'This email cannot be used for a Client account.';
}

export default function OwnerClientsWorkspace() {
  const { request } = useOwnerWorkspace();
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sort, setSort] = useState('name:asc');
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<OwnerPage<OwnerClient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ClientAccountForm>(emptyClientAccountForm);
  const [formError, setFormError] = useState('');
  const [eligibility, setEligibility] = useState<ClientAccountEmailEligibility | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const newClientButton = useRef<HTMLButtonElement>(null);
  const clientNameInput = useRef<HTMLInputElement>(null);
  const eligibilityRequestId = useRef(0);

  const load = useCallback(async ({ query: nextQuery = appliedQuery, sort: nextSort = sort, cursor: nextCursor = cursor }: LoadOptions = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '20', sort: nextSort });
      if (nextQuery) params.set('q', nextQuery);
      if (nextCursor) params.set('cursor', nextCursor);
      const body = await request<ApiBody<OwnerPage<OwnerClient>>>(`/api/owner-workspace/clients?${params}`);
      setPage(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load clients.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, cursor, request, sort]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (dialogOpen) clientNameInput.current?.focus(); }, [dialogOpen]);

  function resetClientAccountForm() {
    eligibilityRequestId.current += 1;
    setForm(emptyClientAccountForm);
    setFormError('');
    setEligibility(null);
    setCheckingEligibility(false);
  }

  useEffect(() => {
    if (window.location.hash !== '#new-client') return;
    resetClientAccountForm();
    setDialogOpen(true);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('clientDeleted') !== '1') return;
    setNotice('Client account deleted successfully.');
    params.delete('clientDeleted');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  function closeDialog() {
    if (creating) return;
    setDialogOpen(false);
    setFormError('');
    eligibilityRequestId.current += 1;
    setCheckingEligibility(false);
    window.setTimeout(() => newClientButton.current?.focus(), 0);
  }

  async function checkEmailEligibility() {
    const email = form.email.trim().toLowerCase();
    if (email.length < 3 || email.length > 254 || !clientAccountEmailPattern.test(email)) return;
    const requestId = eligibilityRequestId.current + 1;
    eligibilityRequestId.current = requestId;
    setCheckingEligibility(true);
    setFormError('');
    try {
      const body = await request<ApiBody<ClientAccountEmailEligibility>>(`/api/owner-workspace/client-accounts/email-eligibility?email=${encodeURIComponent(email)}`);
      if (eligibilityRequestId.current === requestId) setEligibility(body.data);
    } catch {
      if (eligibilityRequestId.current === requestId) {
        setEligibility(null);
        setFormError('Unable to check this client email. Please try again.');
      }
    } finally {
      if (eligibilityRequestId.current === requestId) setCheckingEligibility(false);
    }
  }

  async function createClientAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligibility || !['available', 'resend_available'].includes(eligibility.eligibility)) {
      setFormError('Check the client email before sending an invitation.');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      const body = await request<ApiBody<ProvisionedClient>>('/api/owner-workspace/clients/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: form.phone.trim() || undefined }),
      });
      const nextSort = 'created_at:desc';
      setQuery('');
      setAppliedQuery('');
      setCursor(null);
      setSort(nextSort);
      setCreatedClientId(body.data.client.id);
      setNotice(body.data.delivery.status === 'failed'
        ? 'Client account was created, but invitation delivery failed. Please try again later.'
        : 'Client invitation sent. The client can activate their account from the email.');
      resetClientAccountForm();
      setDialogOpen(false);
      await load({ query: '', sort: nextSort, cursor: null });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to create the client account.');
    } finally {
      setCreating(false);
    }
  }

  const canProvision = Boolean(eligibility && ['available', 'resend_available'].includes(eligibility.eligibility));

  return <section>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-cyan-300">Clients</p><h1 className="mt-1 text-3xl font-semibold">Client management</h1><p className="mt-2 text-sm text-slate-300">Create a Client account and send its secure setup invitation in one step.</p></div><button ref={newClientButton} onClick={() => { resetClientAccountForm(); setDialogOpen(true); }} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100">Create Client Account</button></header>
    <form className="mb-5 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setCursor(null); setAppliedQuery(query.trim()); }}><label className="text-sm">Search <input aria-label="Search clients" value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Sort <select value={sort} onChange={(event) => { setCursor(null); setSort(event.target.value); }} className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="name:asc">Name</option><option value="created_at:desc">Newest</option></select></label><button className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Apply</button></form>
    {notice && <p role="status" className="mb-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}{error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    <section aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800" />)}</div> : !page?.items.length ? <p className="p-5 text-sm text-slate-300">No clients match the selected filters.</p> : <ul className="divide-y divide-slate-800">{page.items.map((client) => <li key={client.id} className={`flex items-center justify-between gap-4 p-4 ${createdClientId === client.id ? 'bg-cyan-950/30' : ''}`}><div><p className="font-medium text-white">{client.name}</p><p className="mt-1 text-xs text-slate-400">{client.client_code} · Created {client.created_at}</p></div><Link href={`/dashboard/clients/${client.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">View client</Link></li>)}</ul>}<div className="flex justify-end border-t border-slate-800 p-4">{page?.pageInfo.hasNextPage && <button onClick={() => setCursor(page.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next page</button>}</div></section>
    {dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}><section role="dialog" aria-modal="true" aria-labelledby="create-client-account-title" onKeyDown={(event) => { if (event.key === 'Escape') closeDialog(); }} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="create-client-account-title" className="text-xl font-semibold">Create Client Account</h2><p className="mt-1 text-sm text-slate-300">A secure setup invitation is sent after the client and contact are created.</p></div><button type="button" onClick={closeDialog} disabled={creating} aria-label="Close client account form" className="text-slate-300 hover:text-white disabled:opacity-60">×</button></div>{formError && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{formError}</p>}<form className="mt-5 space-y-4" onSubmit={createClientAccount}><label className="block text-sm">Client or Company Name<input ref={clientNameInput} aria-label="Client or Company Name" required minLength={2} maxLength={150} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Contact Name<input aria-label="Contact Name" required minLength={2} maxLength={150} value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Email<input aria-label="Email" required type="email" maxLength={254} value={form.email} onChange={(event) => { eligibilityRequestId.current += 1; setEligibility(null); setCheckingEligibility(false); setForm({ ...form, email: event.target.value }); }} onBlur={() => void checkEmailEligibility()} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>{checkingEligibility && <p role="status" className="text-sm text-slate-300">Checking client email…</p>}{eligibility && <p role="status" className={`text-sm ${canProvision ? 'text-cyan-200' : 'text-amber-200'}`}>{eligibilityMessage(eligibility.eligibility)}</p>}<label className="block text-sm">Phone <span className="text-slate-400">(optional)</span><input aria-label="Phone" inputMode="tel" pattern="\+[1-9][0-9]{7,14}" title="Use an international phone number, for example +919876543210." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><div className="flex justify-end gap-3"><button type="button" onClick={closeDialog} disabled={creating} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">Cancel</button><button disabled={creating || checkingEligibility || !canProvision} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">{creating ? 'Sending…' : 'Create and Send Invitation'}</button></div></form></section></div>}
  </section>;
}
