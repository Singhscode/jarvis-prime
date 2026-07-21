'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, ClientPortalAdministration as Portal, OwnerClient, OwnerContact, OwnerPage } from '../lib/owner-contracts';

type Detail = { client: OwnerClient; contacts: OwnerPage<OwnerContact> };

type Props = { clientId: string };

function format(value: string | null) { return value ? new Date(value).toLocaleString() : '—'; }

export default function ClientPortalAdministration({ clientId }: Props) {
  const { request } = useOwnerWorkspace();
  const [detail, setDetail] = useState<Detail | null>(null); const [portal, setPortal] = useState<Portal | null>(null);
  const [contactId, setContactId] = useState(''); const [membershipCursor, setMembershipCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
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

  async function invitation(action: 'invite' | 'resend' | 'revoke', membershipId?: string) {
    setWorking(true); setError(''); setNotice('');
    try {
      const path = action === 'invite' ? `/api/owner-workspace/clients/${clientId}/portal-invitations` : `/api/owner-workspace/clients/${clientId}/portal-members/${membershipId}${action === 'resend' ? '/resend' : ''}`;
      const init: RequestInit = action === 'invite' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId }) } : { method: action === 'revoke' ? 'DELETE' : 'POST' };
      const body = await request<ApiBody<{ membership?: { expires_at?: string } }>>(path, init);
      setNotice(action === 'revoke' ? 'Client Portal access revoked.' : body.data.membership?.expires_at ? `Invitation sent. It expires ${format(body.data.membership.expires_at)}.` : 'Invitation sent.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Portal action failed.'); }
    finally { setWorking(false); }
  }

  if (loading) return <section aria-busy="true" className="space-y-5"><div className="h-10 w-64 animate-pulse rounded bg-slate-800" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-900" />)}</section>;
  if (error && !detail) return <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 p-5"><h1 className="text-xl font-semibold">Client could not load</h1><p className="mt-2 text-sm">{error}</p><button onClick={() => void load()} className="mt-4 underline">Try again</button></section>;
  const contacts = detail?.contacts.items.filter((contact) => Boolean(contact.email)) || [];
  return <section><Link href="/dashboard/clients" className="text-sm text-cyan-300 hover:underline">← Clients</Link><header className="mt-4"><p className="text-sm font-medium text-cyan-300">Client details</p><h1 className="mt-1 text-3xl font-semibold">{detail?.client.name}</h1><p className="mt-2 text-sm text-slate-300">Created {format(detail?.client.created_at || null)}</p></header>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}{notice && <p role="status" className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}
    <div className="mt-6 grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client contacts</h2>{!contacts.length ? <p className="mt-3 text-sm text-slate-300">No client contacts with an email are available for invitation.</p> : <ul className="mt-4 divide-y divide-slate-800">{contacts.map((contact) => <li key={contact.id} className="py-3"><p className="font-medium">{contact.name}</p><p className="text-sm text-slate-400">{contact.email}{contact.title ? ` · ${contact.title}` : ''}</p></li>)}</ul>}</section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Send Client Portal invitation</h2><p className="mt-2 text-sm text-slate-300">A secure invitation is delivered through the existing Client Portal lifecycle.</p><label className="mt-4 block text-sm">Client contact<select aria-label="Client contact" value={contactId} onChange={(event) => setContactId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Select a contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} — {contact.email}</option>)}</select></label><button disabled={!contactId || working} onClick={() => void invitation('invite')} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">{working ? 'Sending…' : 'Send invitation'}</button></section></div>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client Portal status</h2>{!portal?.memberships?.length ? <p className="mt-3 text-sm text-slate-300">No Client Portal memberships are configured.</p> : <ul className="mt-4 divide-y divide-slate-800">{portal.memberships.map((membership) => <li key={membership.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{membership.contact?.name || 'Client contact'}</p><p className="text-sm text-slate-400">{membership.status} · updated {format(membership.updated_at)}</p></div><div className="flex gap-2">{membership.status === 'pending' && <button disabled={working} onClick={() => void invitation('resend', membership.id)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">Resend</button>}{membership.status !== 'revoked' && <button disabled={working} onClick={() => void invitation('revoke', membership.id)} className="rounded-lg border border-red-400/40 px-3 py-2 text-sm text-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60">Revoke</button>}</div></li>)}</ul>}{portal?.pageInfo.hasNextPage && <button onClick={() => setMembershipCursor(portal.pageInfo.nextCursor)} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Next memberships</button>}</section>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Client activity summary</h2>{portal?.activity.status === 'available' ? <ul className="mt-4 divide-y divide-slate-800">{portal.activity.items.map((item) => <li key={item.id} className="py-3"><p>{item.label}</p><p className="text-sm text-slate-400">{format(item.timestamp)}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-300">{portal?.activity.reason || 'No client activity is available.'}</p>}</section>
  </section>;
}
