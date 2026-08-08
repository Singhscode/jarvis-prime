import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import OwnerEmployeesWorkspace from './components/OwnerEmployeesWorkspace';
import OwnerEmployeeDetail from './components/OwnerEmployeeDetail';

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test'; const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); const asOf = '2026-07-21T12:00:00.000Z'; const unavailable = (label: string, reason: string) => ({ label, status: 'unavailable' as const, source: 'users', window: 'current', asOf, reason }); const employee = { id: 'employee-1', employeeCode: 'JP-EMP-000001', fullName: 'Ava Owner', email: 'ava@example.test', workload: { status: 'available' as const, source: 'crm_tasks' as const, window: 'current' as const, asOf, definition: 'Direct assignments currently scoped to this employee.', assigned: 3, open: 2, completed: 1 }, availability: unavailable('Availability', 'No authoritative availability field exists.'), performance: unavailable('Performance summary', 'No authoritative performance definition or source exists.') }; const task = { id: 'task-1', name: 'Review', completed: false, assignee: { id: employee.id, fullName: employee.fullName, email: employee.email }, project: { id: 'project-1', name: 'Launch', client: { id: 'client-1', name: 'Acme' } }, status: unavailable('Task status', 'Completion is the only authoritative task-state field.'), priority: unavailable('Task priority', 'No authoritative task priority field exists.'), dueDate: unavailable('Task due date', 'No authoritative task due-date field exists.'), progress: unavailable('Task progress', 'No authoritative task progress field exists.') }; const bootstrap = { success: true, data: { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } } }; const dashboard = { success: true, data: { asOf, window: 'today', metrics: [], attention: { ...unavailable('Attention', 'Unavailable'), items: [] }, recentActivity: { ...unavailable('Activity', 'Unavailable'), items: [] }, health: unavailable('Health', 'Unavailable') } }; let nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); }); function ownerFetch() { const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { const url = input.toString(); if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' }); if (url.endsWith('/bootstrap')) return json(bootstrap); if (url.endsWith('/dashboard')) return json(dashboard); if (url.endsWith('/employees') && init?.method === 'POST') return json({ success: true, data: { id: 'employee-2', employeeCode: 'JP-EMP-000002', email: 'new.employee@example.test', status: 'invited', delivery: 'dry_run' } }, 201); if (url.includes('/employees/employee-1')) return json({ success: true, data: { employee, projects: [task.project], assignments: { items: [task], pageInfo: { nextCursor: null, hasNextPage: false } } } }); if (url.includes('/employees')) return json({ success: true, data: { items: [employee], pageInfo: { nextCursor: 'MQ', hasNextPage: true } } }); return json({ error: { message: 'Unexpected test request' } }, 500); }); globalThis.fetch = fetch as unknown as typeof fetch; return fetch; } function workspace(node: React.ReactNode) { return render(<DashboardLayout>{node}</DashboardLayout>); }

describe('Owner Workspace employees', () => {
  it('renders a searchable, sortable employee directory with Employee IDs, authoritative workload counts, and cursor pagination', async () => { const user = userEvent.setup(); const fetch = ownerFetch(); workspace(<OwnerEmployeesWorkspace />); expect(await screen.findByRole('heading', { name: 'Employee directory' })).toBeTruthy(); expect(screen.getByText(/Employee ID JP-EMP-000001/)).toBeTruthy(); expect(screen.getByText(/2 open, 1 completed tasks/)).toBeTruthy(); await user.type(screen.getByLabelText('Search employees'), 'Ava'); await user.click(screen.getByRole('button', { name: 'Apply' })); await user.click(await screen.findByRole('button', { name: 'Next page' })); const urls = (fetch.mock.calls as unknown as Array<[RequestInfo | URL]>).map(([url]) => url.toString()); expect(urls.some((url) => url.includes('q=Ava'))).toBe(true); expect(urls.some((url) => url.includes('cursor=MQ'))).toBe(true); });
  it('renders read-only employee details, assignments, projects, and unavailable availability/performance', async () => { const fetch = ownerFetch(); workspace(<OwnerEmployeeDetail employeeId="employee-1" />); expect(await screen.findByRole('heading', { name: 'Ava Owner' })).toBeTruthy(); expect(screen.getAllByText(/Launch/).length).toBeGreaterThan(0); expect(screen.queryByRole('button', { name: /create employee|reset password|change role|deactivate/i })).toBeNull(); expect(screen.getByText(/No authoritative availability field exists/)).toBeTruthy(); expect(screen.getByText(/No authoritative performance definition or source exists/)).toBeTruthy(); expect(screen.getByText(/Employee creation, credential lifecycle/)).toBeTruthy(); const urls = (fetch.mock.calls as unknown as Array<[RequestInfo | URL]>).map(([url]) => url.toString()); expect(urls.every((url) => !url.includes('/employee-portal') && !url.includes('/auth/login'))).toBe(true); });
});


it('renders a recoverable directory error and retries to an explicit empty state', async () => {
  let employeeRequests = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/bootstrap')) return json(bootstrap);
    if (url.endsWith('/dashboard')) return json(dashboard);
    if (url.includes('/employees')) {
      employeeRequests += 1;
      return employeeRequests === 1
        ? json({ error: { message: 'Employee source is temporarily unavailable.' } }, 503)
        : json({ success: true, data: { items: [], pageInfo: { nextCursor: null, hasNextPage: false } } });
    }
    return json({ error: { message: 'Unexpected test request' } }, 500);
  }) as unknown as typeof fetch;
  const user = userEvent.setup();
  workspace(<OwnerEmployeesWorkspace />);
  expect((await screen.findByRole('alert')).textContent).toContain('Employee source is temporarily unavailable.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No employees match the selected filters.')).toBeTruthy();
  expect(employeeRequests).toBe(2);
});


it('invites an employee through the Owner-scoped workflow and refreshes the directory', async () => {
  const user = userEvent.setup(); const fetch = ownerFetch();
  workspace(<OwnerEmployeesWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Invite employee' }));
  await user.type(screen.getByLabelText('Full name'), 'New Employee');
  await user.type(screen.getByLabelText('Email'), 'new.employee@example.test');
  await user.type(screen.getByLabelText('Department'), 'Operations');
  await user.type(screen.getByLabelText('Phone'), '+919876543210');
  await user.click(screen.getByRole('button', { name: 'Send invitation' }));
  expect((await screen.findByRole('status')).textContent).toContain('new.employee@example.test');
  expect(screen.getByRole('status').textContent).toContain('Employee ID JP-EMP-000002');
  const call = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(([url, init]) => url.toString().endsWith('/api/owner-workspace/employees') && init?.method === 'POST');
  expect(JSON.parse(call?.[1]?.body as string)).toEqual({ full_name: 'New Employee', email: 'new.employee@example.test', department: 'Operations', phone: '+919876543210' });
  expect((fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).every(([, init]) => !Object.keys(init?.headers || {}).some((key) => key.toLowerCase().includes('automation')))).toBe(true);
});
