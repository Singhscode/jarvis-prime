'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';

type Props = { open: boolean; onClose: () => void; onCreated: () => void };
type ProjectForm = { client_id: string; name: string };
const emptyForm: ProjectForm = { client_id: '', name: '' };

export default function OwnerProjectCreationDialog({ open, onClose, onCreated }: Props) {
  const { request, refresh } = useOwnerWorkspace();
  const [form, setForm] = useState<ProjectForm>(emptyForm); const [creating, setCreating] = useState(false); const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) nameInput.current?.focus(); }, [open]);
  if (!open) return null;
  function close() { if (!creating) { setError(''); onClose(); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError('');
    try {
      await request('/api/owner-workspace/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: form.client_id.trim(), name: form.name.trim() }) });
      setForm(emptyForm); refresh(); onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create project.'); }
    finally { setCreating(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="new-project-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); }} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="new-project-title" className="text-xl font-semibold">New project</h2><p className="mt-1 text-sm text-slate-300">Projects are created only for clients in your workspace.</p></div><button type="button" aria-label="Close new project form" disabled={creating} onClick={close} className="text-slate-300 hover:text-white disabled:opacity-60">×</button></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
      <form className="mt-5 space-y-4" onSubmit={submit}><label className="block text-sm">Project name<input ref={nameInput} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm">Client ID<input required aria-label="Project client ID" value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><div className="flex justify-end gap-3"><button type="button" disabled={creating} onClick={close} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-300 disabled:opacity-60">Cancel</button><button disabled={creating} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">{creating ? 'Creating…' : 'Create project'}</button></div></form>
    </section>
  </div>;
}
