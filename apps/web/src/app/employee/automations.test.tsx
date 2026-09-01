import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmployeeLayout from './layout';
import EmployeeAutomationsPage from './automations/page';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asOf = '2026-08-20T10:00:00.000Z';
const assigned = { success: true, data: [{ assignmentId: 'assignment-1', code: 'RCP_LEAD_HANDOFF', status: 'ACTIVE', version: 2, recipeVersionId: 'version-1', allowedInputsSha256: 'a'.repeat(64), allowedInputs: { ACT_TASK: ['b'.repeat(64)] } }] };
const assignedDetail = { success: true, data: {
  ...assigned.data[0],
  inputSchema: { properties: { taskId: { type: 'string' }, priority: { type: 'string' }, urgent: { type: 'boolean' } }, required: ['taskId'] },
  rootStep: { stepCode: 'STEP_TASK', actionCode: 'ACT_TASK', requiresHumanReview: false },
} };
const pausableRun = { id: 'run-1', recipeVersionId: 'version-1', correlationId: 'correlation-1', state: 'WAITING', requestedByKind: 'employee', createdAt: asOf, startedAt: asOf, completedAt: null, updatedAt: asOf, permittedActions: { pause: true, resume: true, cancel: false, retry: false } };
const runs = { success: true, data: [pausableRun] };
const work = (state: string, reasonCode: string) => ({ id: 'work-1', sequence: 1, dependencyWorkItemId: null, actionCode: 'ACT_TASK', state, dueAt: asOf, attemptCount: 1, maxAttempts: 3, reasonCode, result: {}, createdAt: asOf, startedAt: asOf, completedAt: null });
const history = (run: unknown, items: unknown[]) => ({ success: true, data: { run, workItems: items, events: [], decisions: [] } });

const nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.useRealTimers(); vi.restoreAllMocks(); });

function mockApi(overrides: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const override = overrides(url, init);
    if (override) return override;
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'employee-token' });
    if (url.endsWith('/api/automation/recipes/assigned')) return json(assigned);
    if (url.endsWith('/api/automation/recipes/assigned/RCP_LEAD_HANDOFF')) return json(assignedDetail);
    if (url.includes('/api/automation/runs?')) return json(runs);
    if (url.endsWith('/api/automation/runs/run-1')) return json(history(pausableRun, [work('WAITING', 'ADMISSION_ALLOWED')]));
    if (init?.method === 'POST') return json({ success: true, data: {} });
    return json({ error: { message: 'Unexpected request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}
const urls = (fetch: ReturnType<typeof mockApi>) => (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).map(([input]) => input.toString());
const bodyOf = (fetch: ReturnType<typeof mockApi>, match: string) => {
  const call = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(([url, init]) => url.toString().endsWith(match) && init?.method === 'POST');
  return { init: call?.[1], body: call?.[1]?.body ? JSON.parse(call[1].body as string) : undefined };
};

describe('Employee automations', () => {
  it('lists only assigned automations and never requests the Owner recipe catalogue', async () => {
    const fetch = mockApi();
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    expect(await screen.findByText('RCP_LEAD_HANDOFF')).toBeTruthy();
    expect(screen.getByText('Status: ACTIVE · Version 2')).toBeTruthy();
    expect(urls(fetch).some((url) => url.includes('/api/automation/recipes?'))).toBe(false);
    expect(urls(fetch).some((url) => url.endsWith('/api/automation/assignments'))).toBe(false);
    expect(urls(fetch).some((url) => url.endsWith('/api/automation/automation-health'))).toBe(false);
  });

  it('builds the run form only from the server input contract and starts the run idempotently', async () => {
    const user = userEvent.setup();
    const fetch = mockApi();
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByLabelText('Task Id')).toBeTruthy();
    expect(screen.getByLabelText('Priority')).toBeTruthy();
    expect(screen.getByLabelText('Urgent')).toBeTruthy();
    // No raw contract internals are exposed to the operator.
    expect(screen.queryByText('a'.repeat(64))).toBeNull();
    expect(screen.queryByText(/inputSchema/)).toBeNull();
    expect(screen.queryByText(/ACT_TASK":/)).toBeNull();

    await user.type(screen.getByLabelText('Task Id'), 'T-1');
    await user.type(screen.getByLabelText('Priority'), 'High');
    await user.click(screen.getByRole('button', { name: 'Run Automation' }));
    const started = bodyOf(fetch, '/api/automation/runs');
    expect(started.body).toEqual({ recipeCode: 'RCP_LEAD_HANDOFF', input: { taskId: 'T-1', priority: 'High', urgent: false } });
    expect(started.init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('uses the dedicated Employee pause and resume operations for its own run', async () => {
    const user = userEvent.setup();
    const fetch = mockApi();
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await user.click(await screen.findByRole('button', { name: 'View run' }));
    expect(await screen.findByRole('heading', { name: 'Run detail' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(urls(fetch)).toContain('http://localhost:3001/api/automation/runs/run-1/pause');
    expect(urls(fetch)).toContain('http://localhost:3001/api/automation/runs/run-1/resume');
    // Employees never reach the generic Owner control endpoint.
    expect(urls(fetch).some((url) => url.endsWith('/api/automation/controls'))).toBe(false);
  });

  it('shows a safe backend refusal when resume is blocked by an emergency stop', async () => {
    const user = userEvent.setup();
    mockApi((url, init) => (url.endsWith('/resume') && init?.method === 'POST'
      ? json({ error: { message: 'Automation request is blocked by an emergency stop.' } }, 409) : undefined));
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await user.click(await screen.findByRole('button', { name: 'View run' }));
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Automation request is blocked by an emergency stop.');
  });

  it('offers retry only when the backend permits it and never exposes review resolution', async () => {
    const user = userEvent.setup();
    const retryRun = { ...pausableRun, state: 'RETRYABLE', permittedActions: { pause: false, resume: false, cancel: false, retry: true } };
    mockApi((url) => (url.endsWith('/api/automation/runs/run-1')
      ? json(history(retryRun, [work('RETRYABLE', 'TRANSIENT_DEPENDENCY_FAILURE')])) : undefined));
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await user.click(await screen.findByRole('button', { name: 'View run' }));
    expect(await screen.findByRole('button', { name: 'Retry step 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fail' })).toBeNull();
  });

  it('shows human review without exposing unauthorized review decisions', async () => {
    const user = userEvent.setup();
    const reviewRun = { ...pausableRun, state: 'HUMAN_REVIEW', permittedActions: { pause: false, resume: false, cancel: false, retry: false } };
    mockApi((url) => (url.endsWith('/api/automation/runs/run-1')
      ? json(history(reviewRun, [work('HUMAN_REVIEW', 'UNKNOWN_OUTCOME')])) : undefined));
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await user.click(await screen.findByRole('button', { name: 'View run' }));
    expect(await screen.findByText('Needs Review')).toBeTruthy();
    expect(screen.getByText('Reason: Unknown outcome')).toBeTruthy();
    expect(screen.getByText('An authorized reviewer must decide the outcome.')).toBeTruthy();
    for (const denied of ['Resume', 'Fail', 'Cancel', 'Retry step 1']) expect(screen.queryByRole('button', { name: denied })).toBeNull();
  });

  it('clears protected automation state after a terminal authorization failure', async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    mockApi((url) => {
      if (!url.includes('/api/automation/recipes/assigned')) return undefined;
      listCalls += 1;
      return listCalls === 1 ? json(assigned) : json({ error: { message: 'Automation access is not permitted.' } }, 403);
    });
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    expect(await screen.findByText('RCP_LEAD_HANDOFF')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
    expect(screen.queryByText('RCP_LEAD_HANDOFF')).toBeNull();
  });

  it('polls an open non-terminal run with one timer and stops after unmount', async () => {
    vi.useFakeTimers();
    const fetch = mockApi();
    const view = render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const openButton = screen.getByRole('button', { name: 'View run' });
    await act(async () => { openButton.click(); await vi.advanceTimersByTimeAsync(0); });
    const detailCalls = () => urls(fetch).filter((url) => url.endsWith('/api/automation/runs/run-1')).length;
    expect(detailCalls()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(detailCalls()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(detailCalls()).toBe(3);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(detailCalls()).toBe(3);
  });

  it('stops polling once the server reports a terminal state', async () => {
    vi.useFakeTimers();
    const completed = { ...pausableRun, state: 'COMPLETED', completedAt: asOf, permittedActions: { pause: false, resume: false, cancel: false, retry: false } };
    const fetch = mockApi((url) => (url.endsWith('/api/automation/runs/run-1') ? json(history(completed, [work('COMPLETED', 'ACTION_COMPLETED')])) : undefined));
    render(<EmployeeLayout><EmployeeAutomationsPage /></EmployeeLayout>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { screen.getByRole('button', { name: 'View run' }).click(); await vi.advanceTimersByTimeAsync(0); });
    const detailCalls = () => urls(fetch).filter((url) => url.endsWith('/api/automation/runs/run-1')).length;
    expect(detailCalls()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(detailCalls()).toBe(1);
  });
});
