'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody } from '../lib/owner-contracts';
import {
  AUTOMATION_LIFECYCLE_TRANSITIONS,
  AUTOMATION_RUN_STATES,
  currentStep,
  formatTimestamp,
  humanizeCode,
  idempotencyKey,
  isTerminalRunState,
  type AutomationAssignmentProjection,
  type AutomationHealth,
  type AutomationLifecycleTransition,
  type AutomationRecipe,
  type AutomationRecipeDetail,
  type AutomationRun,
  type AutomationRunHistory,
  type AutomationRunState,
} from '../../../lib/automation-contracts';

type Tab = 'overview' | 'recipes' | 'assignments' | 'runs' | 'controls';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'recipes', label: 'Recipes' }, { id: 'assignments', label: 'Assignments' },
  { id: 'runs', label: 'Runs' }, { id: 'controls', label: 'Controls' },
];
// Keys match the server-aggregated runCounts projection. The browser never recounts run states.
const RUN_CARDS: { key: string; label: string }[] = [
  { key: 'running', label: 'Running' }, { key: 'waiting', label: 'Waiting' }, { key: 'retryable', label: 'Retryable' },
  { key: 'failed', label: 'Failed' }, { key: 'blocked', label: 'Blocked' }, { key: 'human_review', label: 'Human Review' },
];
const REVIEW_DECISIONS = ['RESUME', 'FAIL', 'CANCEL'] as const;
const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const PRIMARY = 'rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60';
const DANGER = 'rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60';
const FIELD = 'mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-300';

function message(caught: unknown, fallback: string) { return caught instanceof Error ? caught.message : fallback; }

export default function OwnerAutomationControlWorkspace() {
  const { request } = useOwnerWorkspace();
  const [tab, setTab] = useState<Tab>('overview');
  const [health, setHealth] = useState<AutomationHealth | null>(null);
  const [recipes, setRecipes] = useState<AutomationRecipe[]>([]);
  const [assignments, setAssignments] = useState<AutomationAssignmentProjection | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [recipeDetail, setRecipeDetail] = useState<AutomationRecipeDetail | null>(null);
  const [runHistory, setRunHistory] = useState<AutomationRunHistory | null>(null);
  const [stateFilter, setStateFilter] = useState<'all' | AutomationRunState>('all');
  const [versionFilter, setVersionFilter] = useState('all');
  const [transition, setTransition] = useState<AutomationLifecycleTransition>('SUBMIT_REVIEW');
  const [transitionVersionId, setTransitionVersionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailError, setDetailError] = useState('');
  const [stopOpen, setStopOpen] = useState(false);
  const stopTrigger = useRef<HTMLButtonElement>(null);
  const stopConfirm = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'overview') {
        const [healthBody, recipeBody] = await Promise.all([
          request<ApiBody<AutomationHealth>>('/api/automation/automation-health'),
          request<ApiBody<AutomationRecipe[]>>('/api/automation/recipes?limit=100'),
        ]);
        setHealth(healthBody.data); setRecipes(recipeBody.data);
      } else if (tab === 'recipes') {
        const [recipeBody, assignmentBody] = await Promise.all([
          request<ApiBody<AutomationRecipe[]>>('/api/automation/recipes?limit=100'),
          request<ApiBody<AutomationAssignmentProjection>>('/api/automation/assignments'),
        ]);
        setRecipes(recipeBody.data); setAssignments(assignmentBody.data);
      } else if (tab === 'assignments') {
        const body = await request<ApiBody<AutomationAssignmentProjection>>('/api/automation/assignments');
        setAssignments(body.data);
      } else if (tab === 'runs') {
        const body = await request<ApiBody<AutomationRun[]>>('/api/automation/runs?limit=50');
        setRuns(body.data);
      }
    } catch (caught) { setError(message(caught, 'Unable to load automation control data.')); }
    finally { setLoading(false); }
  }, [request, tab]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (stopOpen) stopConfirm.current?.focus(); }, [stopOpen]);

  const openRecipe = useCallback(async (recipeId: string) => {
    setDetailError('');
    try {
      const body = await request<ApiBody<AutomationRecipeDetail>>(`/api/automation/recipes/${recipeId}`);
      setRecipeDetail(body.data);
      setTransitionVersionId(body.data.versions[0]?.id || '');
    } catch (caught) { setDetailError(message(caught, 'Unable to load recipe details.')); }
  }, [request]);

  const openRun = useCallback(async (runId: string, silent = false) => {
    if (!silent) setDetailError('');
    try {
      const body = await request<ApiBody<AutomationRunHistory>>(`/api/automation/runs/${runId}`);
      setRunHistory(body.data);
    } catch (caught) { if (!silent) setDetailError(message(caught, 'Unable to load run details.')); }
  }, [request]);

  // One interval for the open run only, stopped as soon as the server reports a terminal state.
  const openRunId = runHistory?.run.id;
  const openRunState = runHistory?.run.state;
  useEffect(() => {
    if (!openRunId || !openRunState || isTerminalRunState(openRunState)) return undefined;
    const timer = window.setInterval(() => { void openRun(openRunId, true); }, 5_000);
    return () => window.clearInterval(timer);
  }, [openRun, openRunId, openRunState]);

  async function mutate(path: string, init: RequestInit, success: string, after: 'run' | 'recipe' | 'reload') {
    setWorking(true); setDetailError(''); setNotice('');
    try {
      await request<ApiBody<unknown>>(path, init);
      setNotice(success);
      if (after === 'run' && openRunId) await openRun(openRunId, true);
      if (after === 'recipe' && recipeDetail) await openRecipe(recipeDetail.recipe.id);
      await load();
    } catch (caught) { setDetailError(message(caught, 'Automation operation failed.')); }
    finally { setWorking(false); }
  }

  const json = (body: unknown, idempotent = false): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idempotent ? { 'Idempotency-Key': idempotencyKey() } : {}) },
    body: JSON.stringify(body),
  });

  const employeeLabel = (employeeUserId: string) => {
    const candidate = assignments?.candidates.find((item) => item.id === employeeUserId);
    return candidate ? candidate.name || candidate.email : 'Employee is no longer available';
  };
  const assignmentCount = (detail: AutomationRecipeDetail) => {
    const versionIds = new Set(detail.versions.map((version) => version.id));
    return (assignments?.assignments || []).filter((item) => versionIds.has(item.recipeVersionId)).length;
  };
  const visibleRuns = runs.filter((run) => (stateFilter === 'all' || run.state === stateFilter)
    && (versionFilter === 'all' || run.recipeVersionId === versionFilter));

  const skeleton = <div aria-busy="true" className="space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-900" />)}</div>;

  return <section>
    <header className="mb-7"><p className="text-sm font-medium text-cyan-300">Automation</p><h1 className="mt-1 text-3xl font-semibold">Automation control plane</h1><p className="mt-2 text-sm text-slate-300">Inspect and control approved automation. Execution, policy, and permissions are decided by the server; this workspace only shows and requests them.</p></header>

    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Automation sections">{TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setNotice(''); setDetailError(''); }} className={`rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-300 ${tab === item.id ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{item.label}</button>)}</div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    {notice && <p role="status" className="mb-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{notice}</p>}
    {detailError && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{detailError}</p>}

    {tab === 'overview' && (loading ? skeleton : <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={CARD}><p className="text-xs uppercase tracking-wide text-slate-400">Active recipes</p><p className="mt-2 text-2xl font-semibold">{recipes.filter((recipe) => recipe.status === 'ACTIVE').length}</p></div>
        {RUN_CARDS.map((item) => <div key={item.key} className={CARD}><p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p><p className="mt-2 text-2xl font-semibold">{health?.runCounts?.[item.key] ?? 0}</p></div>)}
        <div className={CARD}><p className="text-xs uppercase tracking-wide text-slate-400">Paused</p><p className="mt-2 text-2xl font-semibold">—</p><p className="mt-1 text-xs text-slate-400">Pause is a durable control condition, not a run state.</p></div>
      </div>
      <section className={CARD}><h2 className="text-lg font-semibold">Policy and failure inspection</h2>{!health?.policyFailures.length ? <p className="mt-3 text-sm text-slate-300">No blocked or review policy decisions are recorded.</p> : <ul className="mt-4 divide-y divide-slate-800">{health.policyFailures.map((failure) => <li key={`${failure.runId}:${failure.createdAt}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{humanizeCode(failure.decision)} · {humanizeCode(failure.reasonCode)}</p><p className="mt-1 text-xs text-slate-400">{formatTimestamp(failure.createdAt)}</p></div>{failure.runId && <button onClick={() => { setTab('runs'); void openRun(failure.runId as string); }} className={SECONDARY}>Inspect run</button>}</li>)}</ul>}</section>
    </div>)}

    {tab === 'recipes' && (loading ? skeleton : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className={CARD}><h2 className="text-lg font-semibold">Recipes</h2>{!recipes.length ? <p className="mt-3 text-sm text-slate-300">No recipes exist in this workspace.</p> : <ul className="mt-4 divide-y divide-slate-800">{recipes.map((recipe) => <li key={recipe.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{recipe.code}</p><p className="mt-1 text-xs text-slate-400">{recipe.status} · updated {formatTimestamp(recipe.updatedAt)}</p></div><button onClick={() => void openRecipe(recipe.id)} className={SECONDARY}>View lifecycle</button></li>)}</ul>}</section>
      <aside className={CARD} aria-live="polite"><h2 className="text-lg font-semibold">Recipe lifecycle</h2>{!recipeDetail ? <p className="mt-3 text-sm text-slate-400">Select a recipe to inspect its versions, activation, and lifecycle history.</p> : <div className="mt-4 space-y-4 text-sm">
        <div><p className="font-medium">{recipeDetail.recipe.code}</p><p className="mt-1 text-xs text-slate-400">Status {recipeDetail.recipe.status} · {assignmentCount(recipeDetail)} assignment(s)</p></div>
        <div><p className="text-xs uppercase tracking-wide text-slate-400">Versions</p><ul className="mt-2 space-y-1">{recipeDetail.versions.map((version) => <li key={version.id}>v{version.version} · {version.status}{recipeDetail.activations.some((activation) => activation.recipeVersionId === version.id && activation.status === 'ACTIVE') ? ' · active route' : ''}</li>)}</ul></div>
        <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">Approved and active versions are immutable. Corrections require a new successor draft, which is not authored from this control surface.</p>
        <div className="grid gap-2"><label className="text-xs uppercase tracking-wide text-slate-400">Version<select aria-label="Lifecycle version" value={transitionVersionId} onChange={(event) => setTransitionVersionId(event.target.value)} className={`${FIELD} w-full`}>{recipeDetail.versions.map((version) => <option key={version.id} value={version.id}>v{version.version} ({version.status})</option>)}</select></label>
          <label className="text-xs uppercase tracking-wide text-slate-400">Transition<select aria-label="Lifecycle transition" value={transition} onChange={(event) => setTransition(event.target.value as AutomationLifecycleTransition)} className={`${FIELD} w-full`}>{AUTOMATION_LIFECYCLE_TRANSITIONS.map((item) => <option key={item} value={item}>{humanizeCode(item)}</option>)}</select></label>
          <button disabled={working || !transitionVersionId} onClick={() => void mutate(`/api/automation/recipes/${recipeDetail.recipe.id}/lifecycle`, json({ recipeVersionId: transitionVersionId, transition }), 'Recipe lifecycle transition applied.', 'recipe')} className={PRIMARY}>{working ? 'Applying…' : 'Apply transition'}</button></div>
        <div><p className="text-xs uppercase tracking-wide text-slate-400">Lifecycle history</p>{!recipeDetail.lifecycleEvents.length ? <p className="mt-2 text-slate-400">No lifecycle events recorded.</p> : <ul className="mt-2 space-y-1">{recipeDetail.lifecycleEvents.map((event) => <li key={`${event.transition}:${event.createdAt}`}>{humanizeCode(event.transition)} → {event.nextStatus} · {formatTimestamp(event.createdAt)}</li>)}</ul>}</div>
      </div>}</aside>
    </div>)}

    {tab === 'assignments' && (loading ? skeleton : <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">{([['active', 'Active'], ['paused', 'Paused'], ['revoked', 'Revoked']] as const).map(([key, text]) => <div key={key} className={CARD}><p className="text-xs uppercase tracking-wide text-slate-400">{`${text} assignments`}</p><p className="mt-2 text-2xl font-semibold">{assignments?.counts[key] ?? 0}</p></div>)}</div>
      <section className={CARD}><h2 className="text-lg font-semibold">Assignments</h2><p className="mt-2 text-sm text-slate-300">Allowed input bounds are pinned by the server as a hash. Assignment changes are not available from this release.</p>{!assignments?.assignments.length ? <p className="mt-3 text-sm text-slate-300">No recipe assignments exist.</p> : <ul className="mt-4 divide-y divide-slate-800">{assignments.assignments.map((assignment) => <li key={assignment.id} className="py-3"><p className="font-medium">{employeeLabel(assignment.employeeUserId)}</p><p className="mt-1 text-xs text-slate-400">{assignment.status} · version pinned · bounds {assignment.allowedInputsSha256.slice(0, 12)}… · updated {formatTimestamp(assignment.updatedAt)}</p></li>)}</ul>}</section>
      <section className={CARD}><h2 className="text-lg font-semibold">Employee candidates</h2>{!assignments?.candidates.length ? <p className="mt-3 text-sm text-slate-300">No active employees are available.</p> : <ul className="mt-4 divide-y divide-slate-800">{assignments.candidates.map((candidate) => <li key={candidate.id} className="py-3"><p className="font-medium">{candidate.name || candidate.email}</p><p className="mt-1 text-xs text-slate-400">{candidate.email}</p></li>)}</ul>}</section>
    </div>)}

    {tab === 'runs' && (loading ? skeleton : <div className="space-y-6">
      <form className="flex flex-wrap gap-3" onSubmit={(event) => event.preventDefault()}>
        <label className="text-sm">State <select aria-label="Run state filter" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as 'all' | AutomationRunState)} className={FIELD}><option value="all">All states</option>{AUTOMATION_RUN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
        <label className="text-sm">Recipe version <select aria-label="Run recipe version filter" value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)} className={FIELD}><option value="all">All versions</option>{Array.from(new Set(runs.map((run) => run.recipeVersionId))).map((id) => <option key={id} value={id}>{id.slice(0, 8)}…</option>)}</select></label>
        <button onClick={() => void load()} className={SECONDARY}>Refresh runs</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className={CARD}><h2 className="text-lg font-semibold">Runs</h2>{!visibleRuns.length ? <p className="mt-3 text-sm text-slate-300">No runs match the selected filters.</p> : <ul className="mt-4 divide-y divide-slate-800">{visibleRuns.map((run) => <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{run.state}</p><p className="mt-1 text-xs text-slate-400">Requested by {run.requestedByKind} · created {formatTimestamp(run.createdAt)}</p></div><button onClick={() => void openRun(run.id)} className={SECONDARY}>Inspect</button></li>)}</ul>}</section>
        <aside className={CARD} aria-live="polite"><h2 className="text-lg font-semibold">Run detail</h2>{!runHistory ? <p className="mt-3 text-sm text-slate-400">Select a run to inspect its safe execution history.</p> : <div className="mt-4 space-y-4 text-sm">
          <dl className="space-y-2"><div><dt className="text-xs uppercase tracking-wide text-slate-400">State</dt><dd className="font-medium">{runHistory.run.state}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Requested by</dt><dd>{runHistory.run.requestedByKind}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Current step</dt><dd>{currentStep(runHistory.workItems) ? `${currentStep(runHistory.workItems)?.actionCode} · ${currentStep(runHistory.workItems)?.state}` : '—'}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Attempts</dt><dd>{currentStep(runHistory.workItems) ? `${currentStep(runHistory.workItems)?.attemptCount} of ${currentStep(runHistory.workItems)?.maxAttempts}` : '—'}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Reason</dt><dd>{humanizeCode(currentStep(runHistory.workItems)?.reasonCode || null)}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Started</dt><dd>{formatTimestamp(runHistory.run.startedAt)}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-400">Completed</dt><dd>{formatTimestamp(runHistory.run.completedAt)}</dd></div></dl>
          <div className="flex flex-wrap gap-2">{runHistory.run.permittedActions?.cancel && <button disabled={working} onClick={() => void mutate(`/api/automation/runs/${runHistory.run.id}/cancel`, json({ reasonCode: 'OWNER_CANCELLED' }), 'Run cancellation requested.', 'run')} className={DANGER}>Cancel run</button>}
            {runHistory.run.permittedActions?.retry && runHistory.workItems.filter((item) => item.state === 'RETRYABLE').map((item) => <button key={item.id} disabled={working} onClick={() => void mutate(`/api/automation/work/${item.id}/retry`, json({ reasonCode: 'RETRY_RESUMED' }, true), 'Retry requested.', 'run')} className={SECONDARY}>Retry step {item.sequence}</button>)}</div>
          {runHistory.workItems.filter((item) => item.state === 'HUMAN_REVIEW').map((item) => <div key={item.id} className="rounded-lg border border-amber-300/30 bg-amber-950/20 p-3"><p className="font-medium text-amber-100">Needs review · step {item.sequence}</p><p className="mt-1 text-xs text-slate-300">Reason: {humanizeCode(item.reasonCode)}</p><div className="mt-3 flex flex-wrap gap-2">{REVIEW_DECISIONS.map((decision) => <button key={decision} disabled={working} onClick={() => void mutate(`/api/automation/work/${item.id}/review-resolution`, json({ decision, reasonCode: 'HUMAN_REVIEW_RESOLVED' }, true), `Review resolved as ${decision.toLowerCase()}.`, 'run')} className={SECONDARY}>{humanizeCode(decision)}</button>)}</div></div>)}
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Policy decisions</p>{!runHistory.decisions.length ? <p className="mt-2 text-slate-400">No policy decisions recorded.</p> : <ul className="mt-2 space-y-1">{runHistory.decisions.map((decision) => <li key={`${decision.policyCode}:${decision.createdAt}`}>{decision.policyCode} · {decision.decision} · {humanizeCode(decision.reasonCode)}</li>)}</ul>}</div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Audit timeline</p><ul className="mt-2 space-y-1">{runHistory.events.map((event) => <li key={event.sequence}>{humanizeCode(event.code)} · {event.previousState || '—'} → {event.newState || '—'} · {formatTimestamp(event.createdAt)}</li>)}</ul></div>
        </div>}</aside>
      </div>
    </div>)}

    {tab === 'controls' && <div className="space-y-6">
      <section className={CARD}><h2 className="text-lg font-semibold">Owner-scope automation controls</h2><p className="mt-2 text-sm text-slate-300">These durable controls apply to your whole automation scope. The server keeps the strongest control authoritative.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={working} onClick={() => void mutate('/api/automation/controls', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeType: 'OWNER', scopeId: 'OWNER', paused: true, emergencyStop: false, reasonCode: 'OWNER_PAUSED' }) }, 'Owner scope paused.', 'reload')} className={SECONDARY}>Pause new work</button>
          <button disabled={working} onClick={() => void mutate('/api/automation/controls', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeType: 'OWNER', scopeId: 'OWNER', paused: false, emergencyStop: false, reasonCode: 'OWNER_RESUMED' }) }, 'Owner scope controls cleared.', 'reload')} className={SECONDARY}>Clear owner controls</button>
        </div>
      </section>
      <section className="rounded-2xl border border-red-400/30 bg-red-950/20 p-5"><h2 className="text-lg font-semibold text-red-100">Emergency stop</h2><p className="mt-2 text-sm text-slate-300">This will prevent new eligible automation work from executing in this Owner scope.</p><button ref={stopTrigger} type="button" disabled={working} onClick={() => setStopOpen(true)} className={`mt-4 ${DANGER}`}>Emergency Stop</button></section>
    </div>}

    {stopOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setStopOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="automation-emergency-stop-title" onKeyDown={(event) => { if (event.key === 'Escape' && !working) setStopOpen(false); }} className="w-full max-w-lg rounded-2xl border border-red-400/40 bg-slate-900 p-6 shadow-2xl">
        <h2 id="automation-emergency-stop-title" className="text-xl font-semibold text-red-100">Emergency Stop</h2>
        <p className="mt-3 text-sm text-slate-200">This will prevent new eligible automation work from executing in this Owner scope. Existing history is preserved and the server keeps this control authoritative until you clear it.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={working} onClick={() => { setStopOpen(false); window.setTimeout(() => stopTrigger.current?.focus(), 0); }} className={SECONDARY}>Cancel</button>
          <button ref={stopConfirm} type="button" disabled={working} onClick={() => { setStopOpen(false); void mutate('/api/automation/controls', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopeType: 'OWNER', scopeId: 'OWNER', paused: false, emergencyStop: true, reasonCode: 'OWNER_EMERGENCY_STOP' }) }, 'Emergency stop is active for this Owner scope.', 'reload'); }} className="rounded-lg bg-red-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60">Emergency Stop</button>
        </div>
      </section>
    </div>}
  </section>;
}
