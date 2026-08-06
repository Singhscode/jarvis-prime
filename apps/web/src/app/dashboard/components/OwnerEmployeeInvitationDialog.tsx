'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';

type Props = { open: boolean; onClose: () => void; onCreated: (email: string, delivery: string) => void };
type EmployeeForm = { full_name: string; email: string; department: string; phone: string };
const emptyForm: EmployeeForm = { full_name: '', email: '', department: '', phone: '' };

export default function OwnerEmployeeInvitationDialog({ open, onClose, onCreated }: Props) {
  const { request, refresh } = useOwnerWorkspace();
  const [form, setForm] = useState<EmployeeForm>(emptyForm); const [creating, setCreating] = useState(false); const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) nameInput.current?.focus(); }, [open]);
  if (!open) return null;
  function close() { if (!creating) { setError(''); onClose(); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError('');
    try {
      const body = await request<{ success: true; data: { email: string; delivery: string } }>('/api/owner-workspace/employees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      setForm(emptyForm); refresh(); onCreated(body.data.email, body.data.delivery);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create employee invitation.'); }
    finally { setCreating(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="new-employee-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); }} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="new-employee-title" className="text-xl font-semibold">Invite employee</h2><p className="mt-1 text-sm text-slate-300">The employee receives a one-time password setup link. Owner scope, role, and status are assigned server-side.</p></div><button type="button" aria-label="Close employee invitation form" disabled={creating} onClick={close} className="text-slate-300 hover:text-white disabled:opacity-60">×</button></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
      <form className="mt-5 space-y-4" onSubmit={submit}><label className="block text-sm">Full name<input ref={nameInput} required minLength={2} maxLength={150} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Email<input required type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Department<input required minLength={2} maxLength={80} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Phone<input required inputMode="tel" pattern="\+[1-9][0-9]{7,14}" title="Use an international phone number, for example +919876543210." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><div className="flex justify-end gap-3"><button type="button" disabled={creating} onClick={close} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-300 disabled:opacity-60">Cancel</button><button disabled={creating} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">{creating ? 'Sending…' : 'Send invitation'}</button></div></form>
    </section>
  </div>;
}
