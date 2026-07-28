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

  it('labels unsupported sources as unavailable and exposes named navigation controls', async () => {
    const user = userEvent.setup(); responses(json({ accessToken: 'token' }), json(bootstrap), json(dashboard)); renderDashboard();
    expect(await screen.findByText('Client lifecycle state is not defined.')).toBeTruthy(); expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(1);
    expect(screen.getByRole('link', { name: 'Create Company' }).getAttribute('href')).toBe('/dashboard/crm#create-company'); expect(screen.getByRole('link', { name: 'Create Contact' }).getAttribute('href')).toBe('/dashboard/crm#create-contact'); expect(screen.getByRole('link', { name: 'Create Lead' }).getAttribute('href')).toBe('/dashboard/crm#create-lead'); expect(screen.getByRole('link', { name: 'Create Project' }).getAttribute('href')).toBe('/dashboard/projects#create-project'); expect(screen.getByRole('link', { name: 'Create Task' }).getAttribute('href')).toBe('/dashboard/tasks#create-task'); expect(screen.getByRole('link', { name: 'Upload Document' }).getAttribute('href')).toBe('/dashboard/documents#upload-document'); expect(screen.getByRole('link', { name: 'Convert lead / Client' }).getAttribute('href')).toBe('/dashboard/clients#convert-lead'); expect(screen.getByRole('link', { name: 'Create Employee' }).getAttribute('href')).toBe('/dashboard/employees#invite-employee'); expect(screen.getAllByRole('link', { name: 'Tasks' }).some((link) => link.getAttribute('href') === '/dashboard/tasks')).toBe(true); expect(screen.getByRole('button', { name: /Run Automation/ }).hasAttribute('disabled')).toBe(true); await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Owner Workspace navigation' })).toBeTruthy(); await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('dialog', { name: 'Owner Workspace navigation' })).toBeNull();
  });

  it('shows safe recovery guidance when the backend is unavailable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch; renderDashboard();
    expect(await screen.findByText('Backend service is not running. Please start the API server.')).toBeTruthy();
  });
});
