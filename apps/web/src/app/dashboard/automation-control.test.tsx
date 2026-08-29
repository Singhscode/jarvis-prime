import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import OwnerAutomationControlWorkspace from './components/OwnerAutomationControlWorkspace';

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asOf = '2026-08-20T10:00:00.000Z';
const bootstrap = { success: true, data: { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } } };
const source = { label: 'Unavailable', status: 'unavailable', source: 'owner', window: 'current', asOf, reason: 'Unavailable' };
const dashboard = { success: true, data: { asOf, window: 'today', metrics: [], attention: { ...source, items: [] }, recentActivity: { ...source, items: [] }, health: source } };

const health = { success: true, data: { runCounts: { running: 2, waiting: 3, retryable: 1, failed: 4, blocked: 5, human_review: 6 }, policyFailures: [{ runId: 'run-1', decision: 'BLOCK', reasonCode: 'QUOTA_DENIED', createdAt: asOf }] } };
const recipes = { success: true, data: [
  { id: 'recipe-1', code: 'RCP_LEAD_HANDOFF', status: 'ACTIVE', createdAt: asOf, updatedAt: asOf },
  { id: 'recipe-2', code: 'RCP_DRAFT_FLOW', status: 'DRAFT', createdAt: asOf, updatedAt: asOf },
] };
const assignments = { success: true, data: {
  assignments: [{ id: 'assignment-1', recipeVersionId: 'version-1', employeeUserId: 'employee-1', status: 'ACTIVE', allowedInputsSha256: 'a'.repeat(64), createdAt: asOf, updatedAt: asOf, revokedAt: null }],
  candidates: [{ id: 'employee-1', name: 'Riya Patel', email: 'riya@example.test' }],
  counts: { active: 1, paused: 0, revoked: 0 },
} };
const recipeDetail = { success: true, data: {
  recipe: recipes.data[0],
  versions: [{ id: 'version-1', version: 2, status: 'APPROVED', configurationSha256: 'b'.repeat(64), createdAt: asOf, approvedAt: asOf }],
  activations: [{ recipeVersionId: 'version-1', status: 'ACTIVE', activatedAt: asOf, deactivatedAt: null }],
  lifecycleEvents: [{ recipeVersionId: 'version-1', previousStatus: 'APPROVED', nextStatus: 'ACTIVE', transition: 'ACTIVATE', createdAt: asOf }],
} };
const reviewRun = { id: 'run-1', recipeVersionId: 'version-1', correlationId: 'correlation-1', state: 'HUMAN_REVIEW', requestedByKind: 'employee', createdAt: asOf, startedAt: asOf, completedAt: null, updatedAt: asOf, permittedActions: { pause: true, resume: true, cancel: true, retry: true } };
const finishedRun = { id: 'run-2', recipeVersionId: 'version-1', correlationId: 'correlation-2', state: 'COMPLETED', requestedByKind: 'owner', createdAt: asOf, startedAt: asOf, completedAt: asOf, updatedAt: asOf, permittedActions: { pause: false, resume: false, cancel: false, retry: false } };
const runs = { success: true, data: [reviewRun, finishedRun] };
const work = (id: string, sequence: number, state: string, reasonCode: string) => ({ id, sequence, dependencyWorkItemId: null, actionCode: 'ACT_TASK', state, dueAt: asOf, attemptCount: 1, maxAttempts: 3, reasonCode, result: {}, createdAt: asOf, startedAt: asOf, completedAt: null });
const runHistory = (run: unknown, items: unknown[]) => ({ success: true, data: {
  run, workItems: items,
  events: [{ sequence: 1, code: 'TRIGGER_ACCEPTED', actionCode: 'ACT_TASK', actorSource: 'control', previousState: null, newState: 'WAITING', reasonCode: 'ADMISSION_ALLOWED', metadata: {}, createdAt: asOf }],
  decisions: [{ policyCode: 'POL_APPROVAL', policyVersion: 'V1', decision: 'ALLOW', reasonCode: 'RECIPE_APPROVED', createdAt: asOf }],
} });

const nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); });

function mockApi(overrides: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const override = overrides(url, init);
    if (override) return override;
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
    if (url.endsWith('/api/owner-workspace/dashboard')) return json(dashboard);
    if (url.endsWith('/api/automation/automation-health')) return json(health);
    if (url.includes('/api/automation/recipes?')) return json(recipes);
    if (url.endsWith('/api/automation/assignments')) return json(assignments);
    if (url.endsWith('/api/automation/recipes/recipe-1')) return json(recipeDetail);
    if (url.includes('/api/automation/runs?')) return json(runs);
    if (url.endsWith('/api/automation/runs/run-1')) return json(runHistory(reviewRun, [work('work-1', 1, 'HUMAN_REVIEW', 'UNKNOWN_OUTCOME'), work('work-2', 2, 'RETRYABLE', 'TRANSIENT_DEPENDENCY_FAILURE')]));
    if (url.endsWith('/api/automation/runs/run-2')) return json(runHistory(finishedRun, [work('work-3', 1, 'COMPLETED', 'ACTION_COMPLETED')]));
    if (init?.method === 'POST' || init?.method === 'PUT') return json({ success: true, data: {} });
    return json({ error: { message: 'Unexpected request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}
const bodyOf = (fetch: ReturnType<typeof mockApi>, match: string, method = 'POST') => {
  const call = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)
    .find(([url, init]) => url.toString().endsWith(match) && init?.method === method);
  return { init: call?.[1], body: call?.[1]?.body ? JSON.parse(call[1].body as string) : undefined };
};

describe('Owner automation control plane', () => {
  it('renders server-aggregated overview counts, active recipe totals, and policy failures', async () => {
    mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    expect(await screen.findByRole('heading', { name: 'Automation control plane' })).toBeTruthy();
    const cards = ['Running', 'Waiting', 'Retryable', 'Failed', 'Blocked', 'Human Review'];
    for (const card of cards) expect(await screen.findByText(card)).toBeTruthy();
    const values = ['2', '3', '1', '4', '5', '6'];
    for (const value of values) expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    expect(screen.getByText('Active recipes')).toBeTruthy();
    expect(screen.getByText('Block · Quota denied')).toBeTruthy();
    // PAUSED is a durable control condition, never invented as a run state in the browser.
    expect(screen.getByText('Pause is a durable control condition, not a run state.')).toBeTruthy();
  });

  it('shows recipe lifecycle with assignment counts and submits only server-defined transitions', async () => {
    const user = userEvent.setup();
    const fetch = mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('tab', { name: 'Recipes' }));
    expect(await screen.findByText('RCP_LEAD_HANDOFF')).toBeTruthy();
    expect(screen.getByText('RCP_DRAFT_FLOW')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'View lifecycle' })[0]);
    expect(await screen.findByText('Status ACTIVE · 1 assignment(s)')).toBeTruthy();
    expect(screen.getByText(/Approved and active versions are immutable/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Lifecycle transition'), 'PAUSE');
    await user.click(screen.getByRole('button', { name: 'Apply transition' }));
    const applied = bodyOf(fetch, '/api/automation/recipes/recipe-1/lifecycle');
    expect(applied.body).toEqual({ recipeVersionId: 'version-1', transition: 'PAUSE' });
  });

  it('renders assignment bounds and employee candidates without exposing internal identifiers', async () => {
    const user = userEvent.setup();
    mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('tab', { name: 'Assignments' }));
    expect((await screen.findAllByText('Riya Patel')).length).toBeGreaterThan(0);
    expect(screen.getByText('riya@example.test')).toBeTruthy();
    expect(screen.getByText(/Active assignments/)).toBeTruthy();
    expect(screen.queryByText(/employee-1/)).toBeNull();
    expect(screen.queryByText('a'.repeat(64))).toBeNull();
  });

  it('renders only backend-permitted run actions and resolves human review through the server', async () => {
    const user = userEvent.setup();
    const fetch = mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('tab', { name: 'Runs' }));
    await user.click((await screen.findAllByRole('button', { name: 'Inspect' }))[0]);
    expect(await screen.findByRole('button', { name: 'Cancel run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry step 2' })).toBeTruthy();
    expect(screen.getByText('Needs review · step 1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    const resolved = bodyOf(fetch, '/api/automation/work/work-1/review-resolution');
    expect(resolved.body).toEqual({ decision: 'RESUME', reasonCode: 'HUMAN_REVIEW_RESOLVED' });
    expect(resolved.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
  });

  it('hides run controls the backend does not permit', async () => {
    const user = userEvent.setup();
    mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('tab', { name: 'Runs' }));
    await user.click((await screen.findAllByRole('button', { name: 'Inspect' }))[1]);
    expect((await screen.findAllByText('COMPLETED')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry step/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('requires an accessible confirmation before requesting an Owner emergency stop', async () => {
    const user = userEvent.setup();
    const fetch = mockApi();
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('tab', { name: 'Controls' }));
    await user.click(await screen.findByRole('button', { name: 'Emergency Stop' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText(/prevent new eligible automation work/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bodyOf(fetch, '/api/automation/controls', 'PUT').body).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Emergency Stop' }));
    const confirm = (await screen.findAllByRole('button', { name: 'Emergency Stop' })).at(-1) as HTMLElement;
    await user.click(confirm);
    expect(bodyOf(fetch, '/api/automation/controls', 'PUT').body).toEqual({
      scopeType: 'OWNER', scopeId: 'OWNER', paused: false, emergencyStop: true, reasonCode: 'OWNER_EMERGENCY_STOP',
    });
  });

  it('surfaces the safe backend error without leaking internals', async () => {
    mockApi((url) => (url.endsWith('/api/automation/automation-health') ? json({ error: { message: 'Automation is temporarily unavailable.' } }, 503) : undefined));
    render(<DashboardLayout><OwnerAutomationControlWorkspace /></DashboardLayout>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Automation is temporarily unavailable.');
    expect(alert.textContent).not.toContain('at ');
  });
});
