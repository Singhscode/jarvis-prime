import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import OwnerAnalyticsWorkspace from './components/OwnerAnalyticsWorkspace';

const navigation = vi.hoisted(() => ({ pathname: '/dashboard/analytics' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bootstrap = { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } };
const dashboard = {
  overview: {
    revenue: { totalMinor: 150000, totalMajor: 1500, currencyCode: 'INR' },
    clients: 3,
    activeClients: 3,
    newClientsThisMonth: 1,
    projects: 1,
    tasks: { total: 4, completed: 3, completionRate: 75 },
    leads: 2,
    expenses: { total: 1, approved: 1, totalMinor: 1000, totalMajor: 10 },
  },
  activity24h: { messagesSent: 5, threadsCreated: 1, automationRuns: { completed: 8, failed: 1 } },
  generatedAt: '2026-09-19T00:00:00.000Z',
};

let nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); });

function analyticsFetch({ denyDashboard = false, unavailableOnce = false } = {}) {
  let failedOnce = false;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/api/owner-workspace/bootstrap')) return json({ success: true, data: bootstrap });
    if (url.endsWith('/api/owner-workspace/dashboard')) return json({ success: true, data: { metrics: [], attention: { status: 'unavailable', items: [] }, recentActivity: { status: 'unavailable', items: [] }, health: { status: 'unavailable' } } });
    if (url.endsWith('/api/analytics/dashboard')) {
      if (denyDashboard) return json({ error: { message: 'Access denied.' } }, 403);
      if (unavailableOnce && !failedOnce) { failedOnce = true; return json({ error: { message: 'Analytics is unavailable.' } }, 503); }
      return json({ success: true, data: dashboard });
    }
    return json({ error: { message: 'Unexpected request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}

function workspace(node: React.ReactNode) {
  window.history.replaceState(null, '', '/dashboard/analytics');
  return render(<DashboardLayout>{node}</DashboardLayout>);
}

describe('Owner Analytics workspace', () => {
  it('adds an Analytics nav entry and renders real dashboard metrics from GET /api/analytics/dashboard', async () => {
    analyticsFetch();
    workspace(<OwnerAnalyticsWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Analytics' }).getAttribute('href')).toBe('/dashboard/analytics');
    expect(await screen.findByText('INR 1,500.00')).toBeTruthy();
    expect(screen.getByText('75% (3/4)')).toBeTruthy();
    expect(screen.getByText('8 completed · 1 failed')).toBeTruthy();
  });

  it('shows a retryable error state without crashing when analytics is unavailable', async () => {
    const user = userEvent.setup();
    analyticsFetch({ unavailableOnce: true });
    workspace(<OwnerAnalyticsWorkspace />);
    expect((await screen.findByRole('alert')).textContent).toContain('Analytics is unavailable.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeTruthy();
  });

  it('redirects to sign-in when the owner is denied access (employee/inactive)', async () => {
    analyticsFetch({ denyDashboard: true });
    workspace(<OwnerAnalyticsWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeTruthy();
  });
});
