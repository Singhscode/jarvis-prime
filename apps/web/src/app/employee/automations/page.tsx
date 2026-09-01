'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortalSignIn, usePortalSession } from '../../components/PortalSessionBoundary';
import {
  currentStep,
  formatTimestamp,
  humanizeCode,
  idempotencyKey,
  isTerminalRunState,
  type AssignedRecipe,
  type AssignedRecipeDetail,
  type AutomationInputType,
  type AutomationRun,
  type AutomationRunHistory,
} from '../../../lib/automation-contracts';

type ApiBody<T> = { success: true; data: T };
type FieldValue = string | number | boolean;
const SUPPORTED_FIELDS: AutomationInputType[] = ['string', 'number', 'boolean'];
const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const PRIMARY = 'rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD = 'mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-300';

function message(caught: unknown, fallback: string) { return caught instanceof Error ? caught.message : fallback; }
function label(name: string) { return name.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase()).trim(); }

export default function EmployeeAutomationsPage() {
  const { request, needsLogin } = usePortalSession();
  const [recipes, setRecipes] = useState<AssignedRecipe[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [detail, setDetail] = useState<AssignedRecipeDetail | null>(null);
  const [history, setHistory] = useState<AutomationRunHistory | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const formHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [recipeBody, runBody] = await Promise.all([
        request<ApiBody<AssignedRecipe[]>>('/api/automation/recipes/assigned'),
        request<ApiBody<AutomationRun[]>>('/api/automation/runs?limit=50'),
      ]);
      setRecipes(recipeBody.data); setRuns(runBody.data);
    } catch (caught) { setError(message(caught, 'Unable to load your automations.')); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  // Terminal authentication failure clears every protected automation projection.
  useEffect(() => {
    if (!needsLogin) return;
    setRecipes([]); setRuns([]); setDetail(null); setHistory(null); setValues({}); setNotice('');
  }, [needsLogin]);

  const openRun = useCallback(async (runId: string, silent = false) => {
    if (!silent) setError('');
    try {
      const body = await request<ApiBody<AutomationRunHistory>>(`/api/automation/runs/${runId}`);
      setHistory(body.data);
    } catch (caught) { if (!silent) setError(message(caught, 'Unable to load this run.')); }
  }, [request]);

  const openRunId = history?.run.id;
  const openRunState = history?.run.state;
  useEffect(() => {
    if (!openRunId || !openRunState || isTerminalRunState(openRunState)) return undefined;
    const timer = window.setInterval(() => { void openRun(openRunId, true); }, 5_000);
    return () => window.clearInterval(timer);
  }, [openRun, openRunId, openRunState]);

  async function openRecipe(code: string) {
    setError(''); setNotice('');
    try {
      const body = await request<ApiBody<AssignedRecipeDetail>>(`/api/automation/recipes/assigned/${code}`);
      setDetail(body.data);
      const initial: Record<string, FieldValue> = {};
      for (const [name, property] of Object.entries(body.data.inputSchema.properties)) initial[name] = property.type === 'boolean' ? false : '';
      setValues(initial);
      window.setTimeout(() => formHeading.current?.focus(), 0);
    } catch (caught) { setError(message(caught, 'Unable to load this automation.')); }
  }

  async function act(path: string, init: RequestInit, success: string) {
    setWorking(true); setError(''); setNotice('');
    try {
      await request<ApiBody<unknown>>(path, init);
      setNotice(success);
      if (openRunId) await openRun(openRunId, true);
      await load();
    } catch (caught) { setError(message(caught, 'That automation operation was not permitted.')); }
    finally { setWorking(false); }
  }

  async function runAutomation() {
    if (!detail) return;
    // Only fields declared by the server input contract are ever submitted.
    const input: Record<string, FieldValue> = {};
    for (const [name, property] of Object.entries(detail.inputSchema.properties)) {
      const value = values[name];
      if (property.type === 'boolean') { input[name] = Boolean(value); continue; }
      if (value === '' || value === undefined) continue;
      input[name] = property.type === 'number' ? Number(value) : String(value);
    }
    setWorking(true); setError(''); setNotice('');
    try {
      await request<ApiBody<unknown>>('/api/automation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({ recipeCode: detail.code, input }),
      });
      setNotice('Automation started. It will appear in your history.');
      await load();
    } catch (caught) { setError(message(caught, 'This automation could not be started.')); }
    finally { setWorking(false); }
  }

  if (needsLogin) return <PortalSignIn label="Employee Portal" description="Sign in to run the automations assigned to you." />;

  const unsupported = detail ? Object.entries(detail.inputSchema.properties).filter(([, property]) => !SUPPORTED_FIELDS.includes(property.type)) : [];
  const step = history ? currentStep(history.workItems) : null;
  const permitted = history?.run.permittedActions;

  return <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-medium text-cyan-300">Employee Portal</p><h1 className="mt-1 text-3xl font-semibold">Automations</h1><p className="mt-2 text-sm text-slate-300">Run the automations assigned to you and follow their progress.</p></div>
      <div className="flex gap-2"><Link href="/employee" className={SECONDARY}>Back to portal</Link><button onClick={() => void load()} className={SECONDARY}>Refresh</button></div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}

    <section aria-busy={loading}><h2 className="mb-3 text-xl font-medium">My automations</h2>
      {loading ? <div className="space-y-3">{Array.from({ length: 2 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-900" />)}</div>
        : !recipes.length ? <p className={`${CARD} text-sm text-slate-300`}>No automations are assigned to you yet.</p>
          : <ul className="grid gap-4 sm:grid-cols-2">{recipes.map((recipe) => <li key={recipe.assignmentId} className={CARD}><p className="font-semibold">{recipe.code}</p><p className="mt-1 text-xs text-slate-400">Status: {recipe.status} · Version {recipe.version}</p><p className="mt-2 text-sm text-slate-300">Approved input limits are enforced by the server when this runs.</p><div className="mt-4 flex gap-2"><button onClick={() => void openRecipe(recipe.code)} className={SECONDARY}>View</button><button onClick={() => void openRecipe(recipe.code)} className={PRIMARY}>Run</button></div></li>)}</ul>}
    </section>

    {detail && <section className={CARD} aria-live="polite">
      <h2 ref={formHeading} tabIndex={-1} className="text-xl font-medium">{detail.code}</h2>
      <p className="mt-1 text-sm text-slate-400">Version {detail.version} · Status {detail.status}{detail.rootStep ? ` · First step ${humanizeCode(detail.rootStep.actionCode)}` : ''}</p>
      {detail.rootStep?.requiresHumanReview && <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-950/20 p-3 text-sm text-amber-100">This automation pauses for an authorized review before any action is taken.</p>}
      <form className="mt-5 grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); void runAutomation(); }}>
        {Object.entries(detail.inputSchema.properties).filter(([, property]) => SUPPORTED_FIELDS.includes(property.type)).map(([name, property]) => <label key={name} className="block text-sm">{label(name)}{detail.inputSchema.required.includes(name) ? ' *' : ''}
          {property.type === 'boolean'
            ? <input type="checkbox" aria-label={label(name)} checked={Boolean(values[name])} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.checked }))} className="ml-3 h-4 w-4 rounded border-slate-700 bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300" />
            : <input type={property.type === 'number' ? 'number' : 'text'} aria-label={label(name)} required={detail.inputSchema.required.includes(name)} value={String(values[name] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} className={FIELD} />}
        </label>)}
        {unsupported.length > 0 && <p role="note" className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">This automation needs details that must be prepared by your Owner: {unsupported.map(([name]) => label(name)).join(', ')}.</p>}
        <div className="flex gap-2"><button disabled={working || unsupported.length > 0} className={PRIMARY}>{working ? 'Starting…' : 'Run Automation'}</button><button type="button" onClick={() => { setDetail(null); setValues({}); }} className={SECONDARY}>Close</button></div>
      </form>
    </section>}

    <section><h2 className="mb-3 text-xl font-medium">My run history</h2>
      {!runs.length ? <p className={`${CARD} text-sm text-slate-300`}>You have not started any automations yet.</p>
        : <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/70">{runs.map((run) => <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{run.state}</p><p className="mt-1 text-xs text-slate-400">Started {formatTimestamp(run.startedAt || run.createdAt)}</p></div><button onClick={() => void openRun(run.id)} className={SECONDARY}>View run</button></li>)}</ul>}
    </section>

    {history && <section className={CARD} aria-live="polite"><h2 className="text-xl font-medium">Run detail</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt><dd className="font-medium">{history.run.state}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Version</dt><dd>{history.run.recipeVersionId.slice(0, 8)}…</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Current step</dt><dd>{step ? `${humanizeCode(step.actionCode)} · ${step.state}` : '—'}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Reason</dt><dd>{humanizeCode(step?.reasonCode || null)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Started</dt><dd>{formatTimestamp(history.run.startedAt)}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-400">Finished</dt><dd>{formatTimestamp(history.run.completedAt)}</dd></div>
      </dl>
      {history.workItems.some((item) => item.state === 'HUMAN_REVIEW') && <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-950/20 p-3"><p className="font-medium text-amber-100">Needs Review</p><p className="mt-1 text-sm text-slate-300">Reason: {humanizeCode(history.workItems.find((item) => item.state === 'HUMAN_REVIEW')?.reasonCode || null)}</p><p className="mt-1 text-xs text-slate-400">An authorized reviewer must decide the outcome.</p></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {permitted?.pause && <button disabled={working} onClick={() => void act(`/api/automation/runs/${history.run.id}/pause`, { method: 'POST' }, 'Pause requested.')} className={SECONDARY}>Pause</button>}
        {permitted?.resume && <button disabled={working} onClick={() => void act(`/api/automation/runs/${history.run.id}/resume`, { method: 'POST' }, 'Resume requested.')} className={SECONDARY}>Resume</button>}
        {permitted?.retry && history.workItems.filter((item) => item.state === 'RETRYABLE').map((item) => <button key={item.id} disabled={working} onClick={() => void act(`/api/automation/work/${item.id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ reasonCode: 'RETRY_RESUMED' }) }, 'Retry requested.')} className={SECONDARY}>Retry step {item.sequence}</button>)}
        <button type="button" onClick={() => setHistory(null)} className={SECONDARY}>Close</button>
      </div>
    </section>}
  </main>;
}
