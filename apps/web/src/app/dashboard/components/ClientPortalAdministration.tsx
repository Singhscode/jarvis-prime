'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, ClientPortalAdministration as Portal, OwnerClient, OwnerContact, OwnerPage } from '../lib/owner-contracts';

type Detail = { client: OwnerClient; contacts: OwnerPage<OwnerContact> };

type Props = { clientId: string; onDeleted?: () => void };
type ContactDraft = { name: string; email: string; phone: string; title: string };

const emptyContact: ContactDraft = { name: '', email: '', phone: '', title: '' };

function format(value: string | null) { return value ? new Date(value).toLocaleString() : '—'; }

export default function ClientPortalAdministration({ clientId, onDeleted }: Props) {
  const { request } = useOwnerWorkspace();
  const [detail, setDetail] = useState<Detail | null>(null); const [portal, setPortal] = useState<Portal | null>(null);
  const [contactId, setContactId] = useState(''); const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyContact); const [membershipCursor, setMembershipCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false); const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const portalPath = membershipCursor ? `/api/owner-workspace/clients/${clientId}/portal?cursor=${encodeURIComponent(membershipCursor)}` : `/api/owner-workspace/clients/${clientId}/portal`;
      const [client, portalData] = await Promise.all([request<ApiBody<Detail>>(`/api/owner-workspace/clients/${clientId}`), request<ApiBody<Portal>>(portalPath)]);
      setDetail(client.data); setPortal(portalData.data);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load this client.'); }
    finally { setLoading(false); }
  }, [clientId, membershipCursor, request]);
  useEffect(() => { void load(); }, [load]);

  async function createContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const name = contactDraft.name.trim(); const email = contactDraft.email.trim();
    if (!name || !email) { setError('Contact name and email are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid contact email.'); return; }
    setWorking(true);
    try {
      await request<ApiBody<OwnerContact>>(`/api/owner-workspace/clients/${clientId}/contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: contactDraft.phone.trim() || null, title: contactDraft.title.trim() || null }),
      });
      setContactDraft(emptyContact); setNotice('Client contact added.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to add the client contact.'); }
    finally { setWorking(false); }
  }

  async function invitation(action: 'invite' | 'resend' | 'revoke', membershipId?: string) {
    setWorking(true); setError(''); setNotice('');
    try {
      const path = action === 'invite' ? `/api/owner-workspace/clients/${clientId}/portal-invitations` : `/api/owner-workspace/clients/${clientId}/portal-members/${membershipId}${action === 'resend' ? '/resend' : ''}`;
      const init: RequestInit = action === 'invite' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId }) } : { method: action === 'revoke' ? 'DELETE' : 'POST' };
      const body = await request<ApiBody<{ membership?: { expires_at?: string } }>>(path, init);
      setNotice(action === 'revoke' ? 'Client Portal access revoked.' : action === 'invite' ? body.data.membership?.expires_at ? `Active Client identity attachment invitation sent. It expires ${format(body.data.membership.expires_at)}.` : 'Active Client identity attachment invitation sent.' : body.data.membership?.expires_at ? `Invitation resent. It expires ${format(body.data.membership.expires_at)}.` : 'Invitation resent.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Portal action failed.'); }
    finally { setWorking(false); }
  }

  async function deleteClientAccount() {
    if (!detail || deleteConfirmation !== detail.client.name) return;
    setWorking(true); setError('');
    try {
      await request(`/api/owner-workspace/clients/${clientId}`, { method: 'DELETE' });
      if (onDeleted) onDeleted(); else window.location.assign('/dashboard/clients');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Client account deletion failed.'); }
    finally { setWorking(false); }
  }

  if (loading) return <section aria-busy="true" className="space-y-5"><div className="h-10 w-64 animate-pulse rounded bg-slate-800" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-900" />)}</section>;
  if (error && !detail) return <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 p-5"><h1 className="text-xl font-semibold">Client could not load</h1><p className="mt-2 text-sm">{error}</p><button onClick={() => void load()} className="mt-4 underline">Try again</button></section>;
  const contacts = detail?.contacts.items.filter((contact) => Boolean(contact.email)) || [];
  const deleteClientEmail = contacts[0]?.email || null;
  return <section><Link href="/dashboard/clients" className="text-sm text-cyan-300 hover:underline">← Clients</Link><header className="mt-4"><p className="text-sm font-medium text-cyan-300">Client details</p><h1 className="mt-1 text-3xl font-semibold">{detail?.client.name}</h1><p className="mt-2 text-sm text-slate-300">Created {format(detail?.client.created_at || null)}</p></header>
    <section className="mt-6 rounded-2xl border border-red-400/30 bg-red-950/20 p-5"><h2 className="text-lg font-semibold text-red-100">Delete Client Account</h2><p className="mt-2 text-sm text-slate-300">This permanently removes this client account only when no protected finance, project, document, or shared-access records exist.</p><button type="button" disabled={working} onClick={() => { setDeleteConfirmation(''); setDeleteOpen(true); }} className="mt-4 rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60">Delete Client Account</button></section>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}{notice && <p role="status" className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}
    <div className="mt-6 grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client contacts</h2><form className="mt-4 grid gap-3" noValidate onSubmit={(event) => void createContact(event)}><label className="text-sm">Contact name<input aria-label="Contact name" value={contactDraft.name} onChange={(event) => setContactDraft({ ...contactDraft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Contact email<input aria-label="Contact email" type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Contact phone<input aria-label="Contact phone" value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="text-sm">Contact title<input aria-label="Contact title" value={contactDraft.title} onChange={(event) => setContactDraft({ ...contactDraft, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><button disabled={working} className="justify-self-start rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">{working ? 'Adding…' : 'Add Contact'}</button></form>{!contacts.length ? <p className="mt-4 text-sm text-slate-300">No client contacts with an email are available.</p> : <ul className="mt-4 divide-y divide-slate-800">{contacts.map((contact) => <li key={contact.id} className="py-3"><p className="font-medium">{contact.name}</p><p className="text-sm text-slate-400">{contact.email}{contact.title ? ` · ${contact.title}` : ''}</p></li>)}</ul>}</section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Attach an active Client identity</h2><p className="mt-2 text-sm text-slate-300">Legacy membership administration only: use this separately from Client onboarding when the contact already has an active Client identity. The server permits attachment only for that active identity; this never creates or activates a Client account.</p><label className="mt-4 block text-sm">Contact with an active Client identity<select aria-label="Contact with an active Client identity" value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Select a contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} — {contact.email}</option>)}</select></label><button disabled={!contactId || working} onClick={() => void invitation('invite')} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">{working ? 'Attaching…' : 'Attach active Client identity'}</button></section></div>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client Portal status</h2>{!portal?.memberships?.length ? <p className="mt-3 text-sm text-slate-300">No Client Portal memberships are configured.</p> : <ul className="mt-4 divide-y divide-slate-800">{portal.memberships.map((membership) => <li key={membership.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{membership.contact?.name || 'Client contact'}</p><p className="text-sm text-slate-400">{membership.status} · updated {format(membership.updated_at)}</p></div><div className="flex gap-2">{membership.status === 'pending' && <button disabled={working} onClick={() => void invitation('resend', membership.id)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">Resend</button>}{membership.status !== 'revoked' && <button disabled={working} onClick={() => void invitation('revoke', membership.id)} className="rounded-lg border border-red-400/40 px-3 py-2 text-sm text-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60">Revoke</button>}</div></li>)}</ul>}{portal?.pageInfo.hasNextPage && <button onClick={() => setMembershipCursor(portal.pageInfo.nextCursor)} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next memberships</button>}</section>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client activity summary</h2>{portal?.activity.status === 'available' ? <ul className="mt-4 divide-y divide-slate-800">{portal.activity.items.map((item) => <li key={item.id} className="py-3"><p>{item.label}</p><p className="text-sm text-slate-400">{format(item.timestamp)}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-300">{portal?.activity.reason || 'No client activity is available.'}</p>}</section>
    {deleteOpen && detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><section role="dialog" aria-modal="true" aria-labelledby="delete-client-account-title" className="w-full max-w-lg rounded-2xl border border-red-400/40 bg-slate-900 p-6 shadow-2xl"><h2 id="delete-client-account-title" className="text-xl font-semibold text-red-100">Delete Client Account</h2><p className="mt-3 text-sm text-slate-200">You are about to permanently delete this Client account. This cannot be undone.</p><dl className="mt-4 space-y-2 rounded-lg border border-red-400/20 bg-red-950/20 p-3 text-sm text-slate-200"><div><dt className="inline font-semibold">Client name: </dt><dd className="inline">{detail.client.name}</dd></div><div><dt className="inline font-semibold">Client ID: </dt><dd className="inline"><code>{detail.client.id}</code></dd></div>{deleteClientEmail && <div><dt className="inline font-semibold">Client email: </dt><dd className="inline">{deleteClientEmail}</dd></div>}</dl><label className="mt-5 block text-sm">Type <strong>{detail.client.name}</strong> exactly to confirm.<input aria-label="Confirm client name" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={working} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-300" /></label><div className="mt-5 flex justify-end gap-3"><button type="button" disabled={working} onClick={() => setDeleteOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-300 disabled:opacity-60">Cancel</button><button type="button" disabled={working || deleteConfirmation !== detail.client.name} onClick={() => void deleteClientAccount()} className="rounded-lg bg-red-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">{working ? 'Deleting…' : 'Delete Client Account'}</button></div></section></div>}
  </section>;
}
