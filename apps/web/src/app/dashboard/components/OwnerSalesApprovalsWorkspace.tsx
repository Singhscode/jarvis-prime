'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, SalesApproval, SalesApprovalList, SalesApprovalStatus } from '../lib/owner-contracts';

const statusOptions: Array<{ value: 'all' | SalesApprovalStatus; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'changes_required', label: 'Changes required' },
  { value: 'approved', label: 'Approved' },
  { value: 'released_dry_run', label: 'Released (dry run)' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'stopped', label: 'Stopped' },
];

function idempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-approval`;
}

function statusStyle(status: SalesApprovalStatus) {
  if (status === 'approved' || status === 'released_dry_run') return 'border-emerald-400/30 bg-emerald-950/30 text-emerald-100';
  if (status === 'changes_required' || status === 'blocked') return 'border-amber-400/30 bg-amber-950/30 text-amber-100';
  if (status === 'rejected' || status === 'stopped') return 'border-red-400/30 bg-red-950/30 text-red-100';
  return 'border-cyan-400/30 bg-cyan-950/30 text-cyan-100';
}

function ApprovalCard({ action, busy, onMutate }: { action: SalesApproval; busy: boolean; onMutate: (path: string, body: object, withIdempotency?: boolean) => Promise<void> }) {
  const [subject, setSubject] = useState(action.subject);
  const [body, setBody] = useState(action.body);
  const [reason, setReason] = useState('');
  useEffect(() => { setSubject(action.subject); setBody(action.body); setReason(''); }, [action]);
  const editable = ['pending_review', 'changes_required', 'approved'].includes(action.status);
  const canDecide = ['pending_review', 'changes_required', 'approved'].includes(action.status);
  const changed = subject.trim() !== action.subject || body.trim() !== action.body;
  const decision = (value: 'approve' | 'reject' | 'stop') => onMutate(
    `/api/sales-agents/approvals/${action.id}/decisions`,
    { expectedRevision: action.revision, decision: value, ...(value === 'approve' ? {} : { reason }) },
  );

  return <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{action.recipient.name}</h2><p className="text-sm text-slate-300">{action.recipient.email} · {action.clientName} · Step {action.step}</p></div>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(action.status)}`}>{action.status.replaceAll('_', ' ')}</span>
    </div>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-500">Evidence</dt><dd className="mt-1 break-all text-slate-200">{action.evidence.source}: {action.evidence.reference}</dd></div>
      <div><dt className="text-slate-500">Consent basis</dt><dd className="mt-1 text-slate-200">{action.evidence.consentStatus.replaceAll('_', ' ')}</dd></div>
      <div><dt className="text-slate-500">Revision</dt><dd className="mt-1 text-slate-200">{action.revision}</dd></div>
    </dl>
    <div className="mt-4 grid gap-4">
      <label className="text-sm font-medium">Subject<input value={subject} disabled={!editable || busy} onChange={(event) => setSubject(event.target.value)} maxLength={120} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60" /></label>
      <label className="text-sm font-medium">Body<textarea value={body} disabled={!editable || busy} onChange={(event) => setBody(event.target.value)} maxLength={1500} rows={7} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60" /></label>
    </div>
    <section className="mt-4" aria-label="Deterministic evaluation">
      <p className={`text-sm font-semibold ${action.evaluation.passed ? 'text-emerald-300' : 'text-amber-300'}`}>Evaluation: {action.evaluation.passed ? 'passed' : 'changes required'}</p>
      <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">{action.evaluation.checks.map((entry) => <li key={entry.code} className={`rounded-lg border p-2 ${entry.passed ? 'border-emerald-400/20 text-emerald-100' : 'border-amber-400/30 text-amber-100'}`}>{entry.passed ? 'Pass' : 'Fail'} · {entry.message}</li>)}</ul>
    </section>
    {canDecide && <label className="mt-4 block text-sm font-medium">Reason for reject or stop<input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60" /></label>}
    <div className="mt-5 flex flex-wrap gap-2">
      {editable && <button disabled={busy || !changed} onClick={() => void onMutate(`/api/sales-agents/approvals/${action.id}/revisions`, { expectedRevision: action.revision, subject, body })} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-40">Save new revision</button>}
      {action.status === 'pending_review' && action.evaluation.passed && <button disabled={busy || changed} onClick={() => void decision('approve')} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Approve</button>}
      {canDecide && <button disabled={busy || reason.trim().length < 3} onClick={() => void decision('reject')} className="rounded-lg border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-100 disabled:opacity-40">Reject</button>}
      {canDecide && <button disabled={busy || reason.trim().length < 3} onClick={() => void decision('stop')} className="rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-semibold text-amber-100 disabled:opacity-40">Stop</button>}
      {action.status === 'approved' && <button disabled={busy} onClick={() => void onMutate(`/api/sales-agents/approvals/${action.id}/release-dry-run`, { expectedRevision: action.revision }, true)} className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Release approved dry run</button>}
    </div>
    {action.status === 'released_dry_run' && <p className="mt-4 text-sm text-emerald-200">Recorded as a compliant dry run. No provider delivery occurred.</p>}
  </article>;
}

export default function OwnerSalesApprovalsWorkspace() {
  const { request } = useOwnerWorkspace();
  const [items, setItems] = useState<SalesApproval[]>([]);
  const [status, setStatus] = useState<'all' | SalesApprovalStatus>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prospectId, setProspectId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await request<ApiBody<SalesApprovalList>>(`/api/sales-agents/approvals?status=${encodeURIComponent(status)}&limit=100`);
      setItems(response.data.items);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load sales approvals.'); }
    finally { setLoading(false); }
  }, [request, status]);
  useEffect(() => { void load(); }, [load]);

  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setBusyId('prepare'); setError(''); setNotice('');
    try {
      await request<ApiBody<SalesApproval>>('/api/sales-agents/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ prospectId: prospectId.trim(), campaignId: null, step: 1 }),
      });
      setNotice('The prospect was prepared from its persisted evidence and consent record. Failed checks must be corrected before approval.');
      setProspectId('');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to prepare the prospect.'); }
    finally { setBusyId(''); }
  }

  async function mutate(path: string, body: object, withIdempotency = false) {
    const actionId = path.split('/')[4] || path; setBusyId(actionId); setError(''); setNotice('');
    try {
      const response = await request<ApiBody<SalesApproval>>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(withIdempotency ? { 'Idempotency-Key': idempotencyKey() } : {}) }, body: JSON.stringify(body) });
      setItems((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      setNotice(response.data.status === 'released_dry_run' ? 'Approved action released as a dry run; no provider was called.' : 'Approval updated.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update the approval.'); }
    finally { setBusyId(''); }
  }

  return <section>
    <header className="mb-7"><p className="text-sm font-medium text-cyan-300">AI sales agents · Phase 15A</p><h1 className="mt-1 text-3xl font-semibold">Sales approval queue</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">One persisted prospect at a time. Evidence, consent, score, draft, evaluation, revisions, and Owner decisions are recorded. Live email, bulk release, follow-ups, and LinkedIn delivery remain disabled.</p></header>
    <form onSubmit={(event) => void prepare(event)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-lg font-semibold">Prepare one prospect</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">The prospect, approved source reference, collection time, and consent basis must already be persisted through a trusted import or administration workflow. This screen cannot create or overwrite that evidence.</p>
      <label className="mt-4 block max-w-xl text-sm font-medium">Prospect ID<input required value={prospectId} onChange={(event) => setProspectId(event.target.value)} placeholder="UUID" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
      <button disabled={busyId === 'prepare'} className="mt-4 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{busyId === 'prepare' ? 'Preparing…' : 'Generate review draft'}</button>
    </form>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Review items</h2><label className="text-sm">Filter <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | SalesApprovalStatus)} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>}
    {loading ? <p className="mt-6 text-sm text-slate-400">Loading approvals…</p> : items.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No approvals match this filter.</p> : <div className="mt-4 space-y-4">{items.map((action) => <ApprovalCard key={action.id} action={action} busy={busyId === action.id} onMutate={mutate} />)}</div>}
  </section>;
}
