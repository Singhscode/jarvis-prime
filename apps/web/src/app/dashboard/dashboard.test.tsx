import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import DashboardPage from './page';

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bootstrap = { success: true, data: { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } } };
const asOf = '2026-07-21T12:00:00.000Z';
const dashboard = { success: true, data: { asOf, window: 'today', metrics: [
  { label: 'Active clients', status: 'unavailable', source: 'crm_clients', window: 'current', asOf, reason: 'Client lifecycle state is not defined.' },
  { label: 'Active employees', status: 'available', value: 2, source: 'users', window: 'current', asOf },
  { label: 'Open projects', status: 'unavailable', source: 'crm_projects', window: 'current', asOf, reason: 'Project lifecycle state is not defined.' },
  { label: 'Open tasks', status: 'available', value: 3, source: 'crm_tasks', window: 'current', asOf },
  { label: 'Completed tasks', status: 'available', value: 4, source: 'crm_tasks', window: 'current', asOf },
], attention: { label: 'Attention', status: 'unavailable', source: 'owner_workspace', window: 'current', asOf, reason: 'No approved attention source is available.', items: [] }, recentActivity: { label: 'Recent activity', status: 'unavailable', source: 'audit_logs', window: 'current', asOf, reason: 'No safe owner-attributable activity source is available.', items: [] }, health: { label: 'System health', status: 'not_configured', source: 'owner_workspace', window: 'current', asOf, reason: 'A redacted health source is not configured.' } } };
let nativeFetch = globalThis.fetch;

afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); });
function responses(...items: Response[]) { const fetch = vi.fn(async () => items.shift() || json({}, 500)); globalThis.fetch = fetch as unknown as typeof fetch; return fetch; }
function renderDashboard() { return render(<DashboardLayout><DashboardPage /></DashboardLayout>); }

describe('Owner Workspace dashboard', () => {
  it('refreshes in memory, retries one protected 401, and never persists workspace state', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem'); const setSession = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = responses(json({ accessToken: 'one' }), json({ error: { message: 'Expired' } }, 401), json({ accessToken: 'two' }), json(bootstrap), json(dashboard));
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Owner workspace' })).toBeTruthy();
    expect(screen.getByText('Active employees').parentElement?.textContent).toContain('2');
    expect(fetch).toHaveBeenCalledTimes(5); expect(setLocal).not.toHaveBeenCalled(); expect(setSession).not.toHaveBeenCalled();
    expect((fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).every(([, init]) => !Object.keys(init?.headers || {}).some((key) => key.toLowerCase().includes('automation')))).toBe(true);
  });

  it('uses the shared login endpoint after refresh failure and clears the dashboard on logout', async () => {
    const user = userEvent.setup(); const fetch = responses(json({ error: { message: 'No session' } }, 401), json({ tokens: { accessToken: 'login' } }), json(bootstrap), json(dashboard), json({ success: true }));
    renderDashboard(); await screen.findByRole('heading', { name: 'Sign in to continue' });
    await user.type(screen.getByLabelText('Email'), 'owner@example.test'); await user.type(screen.getByLabelText('Password'), 'password'); await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Owner workspace' })).toBeTruthy(); await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
    const loginCall = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[1]; expect(JSON.parse(loginCall[1]?.body as string)).toMatchObject({ email: 'owner@example.test', password: 'password', deviceName: 'Owner Workspace' });
  });

  it('opens all scoped quick-action workflows without browser automation credentials', async () => {
    responses(json({ accessToken: 'token' }), json(bootstrap), json(dashboard)); renderDashboard();
    expect(await screen.findByText('Client lifecycle state is not defined.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create project' }).getAttribute('href')).toBe('/dashboard/projects#new-project');
    expect(screen.getByRole('link', { name: 'Create task' }).getAttribute('href')).toBe('/dashboard/projects#new-task');
    expect(screen.getByRole('link', { name: 'Invite client' }).getAttribute('href')).toBe('/dashboard/clients#new-client');
    expect(screen.getByRole('link', { name: 'Upload document' }).getAttribute('href')).toBe('/dashboard/documents');
    expect(screen.getByRole('link', { name: 'Create employee' }).getAttribute('href')).toBe('/dashboard/employees#new-employee');
    expect(screen.getByRole('link', { name: 'Run automation' }).getAttribute('href')).toBe('/dashboard/automation#run-automation');
  });

  it('shows safe recovery guidance when the backend is unavailable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch; renderDashboard();
    expect(await screen.findByText('Unable to reach the API. This may be caused by network connectivity or CORS configuration.')).toBeTruthy();
  });
});
