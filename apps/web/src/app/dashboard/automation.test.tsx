import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import OwnerAutomationWorkspace from './components/OwnerAutomationWorkspace';

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asOf = '2026-08-05T12:00:00.000Z';
const bootstrap = { success: true, data: { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } } };
const dashboard = { success: true, data: { asOf, window: 'today', metrics: [], attention: { label: 'Attention', status: 'unavailable', source: 'owner', window: 'current', asOf, reason: 'Unavailable', items: [] }, recentActivity: { label: 'Activity', status: 'unavailable', source: 'owner', window: 'current', asOf, reason: 'Unavailable', items: [] }, health: { label: 'Health', status: 'unavailable', source: 'owner', window: 'current', asOf, reason: 'Unavailable' } } };
let nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); });

describe('Owner automation runner', () => {
  it('starts only the allowlisted scoped workflow, uses an idempotency key, and never sends an automation secret', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
      if (url.endsWith('/bootstrap')) return json(bootstrap);
      if (url.endsWith('/dashboard')) return json(dashboard);
      if (url.endsWith('/automation-runs') && init?.method === 'POST') return json({ success: true, data: { id: 'run-1', workflow: 'workspace_summary', status: 'pending', logs: [{ at: asOf, message: 'Workspace summary queued.' }], result: null } }, 202);
      if (url.endsWith('/automation-runs/run-1')) return json({ success: true, data: { id: 'run-1', workflow: 'workspace_summary', status: 'completed', logs: [{ at: asOf, message: 'Workspace summary completed.' }], result: { generatedAt: asOf, metrics: [{ label: 'Open tasks', value: 3 }] } } });
      return json({ error: { message: 'Unexpected request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;
    render(<DashboardLayout><OwnerAutomationWorkspace /></DashboardLayout>);
    await user.click(await screen.findByRole('button', { name: 'Run automation' }));
    expect(await screen.findByText('pending')).toBeTruthy();
    const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const runCall = calls.find(([url, init]) => url.toString().endsWith('/automation-runs') && init?.method === 'POST');
    expect(JSON.parse(runCall?.[1]?.body as string)).toEqual({ workflow: 'workspace_summary' });
    expect(runCall?.[1]?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
    expect(calls.every(([, init]) => !Object.keys(init?.headers || {}).some((key) => key.toLowerCase().includes('automation-secret')))).toBe(true);
    await waitFor(() => expect(calls.filter(([url]) => url.toString().endsWith('/dashboard')).length).toBeGreaterThanOrEqual(2));
  });
});
