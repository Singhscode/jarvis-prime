import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientSignIn from '../client/components/ClientSignIn';
import EmployeeLayout from './layout';
import EmployeePage from './page';

const snapshot = {
  projects: [{ id: 'project-1', client_id: 'client-1', name: 'Launch' }],
  tasks: [], clients: [], leads: [],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const nativeFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = nativeFetch;
  vi.restoreAllMocks();
});

describe('EmployeePage shared session boundary', () => {
  it('loads scoped portal data through the layout provider without browser persistence', async () => {
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'employee-token' });
      if (url.endsWith('/api/employee-portal')) return json({ success: true, data: snapshot });
      return json({ error: { message: 'Unexpected request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;

    render(<EmployeeLayout><EmployeePage /></EmployeeLayout>);
    expect(await screen.findByText('Launch')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Communications' }).getAttribute('href')).toBe('/employee/communications');
    expect(persist).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([input]) => input.toString())).toEqual([
      'http://localhost:3001/api/auth/refresh', 'http://localhost:3001/api/employee-portal',
    ]);
  });

  it('clears employee snapshots after terminal 403 denial and renders the accessible Employee sign-in view', async () => {
    const user = userEvent.setup();
    let portalCalls = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'employee-token' });
      if (url.endsWith('/api/employee-portal')) {
        portalCalls += 1;
        if (portalCalls === 1) return json({ success: true, data: snapshot });
        return json({ error: { message: 'Terminated' } }, 403);
      }
      return json({}, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;
    render(<EmployeeLayout><EmployeePage /></EmployeeLayout>);
    expect(await screen.findByText('Launch')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const email = await screen.findByLabelText('Email');
    expect(screen.getByText('Employee Portal')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByAltText('JARVIS PRIME')).toBeTruthy();
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('alert').textContent).toContain('Terminated');
    expect(screen.queryByText('Launch')).toBeNull();
  });

  it('uses the existing Employee login flow and returns to the workspace after successful sign-in', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ error: { message: 'No session' } }, 401);
      if (url.endsWith('/api/auth/login')) return json({ tokens: { accessToken: 'login-token' } });
      if (url.endsWith('/api/employee-portal')) return json({ success: true, data: snapshot });
      if (url.endsWith('/api/auth/logout')) return json({ success: true });
      return json({ error: { message: 'Unexpected request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;

    render(<EmployeeLayout><EmployeePage /></EmployeeLayout>);
    await screen.findByRole('heading', { name: 'Welcome back' });
    await user.type(screen.getByLabelText('Email'), 'employee@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Launch')).toBeTruthy();
    const loginCall = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(
      ([input]) => input.toString().endsWith('/api/auth/login')
    );
    expect(loginCall).toBeDefined();
    expect(JSON.parse(loginCall?.[1]?.body as string)).toMatchObject({
      email: 'employee@example.test', password: 'password', deviceName: 'Employee Portal',
    });

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });

  it('renders Employee-branded pending and error states with a disabled, accessible sign-in control', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ClientSignIn
      credentials={{ email: 'employee@example.test', password: 'password' }}
      error="Too many failed attempts. Account locked."
      loading
      onChange={vi.fn()}
      onSubmit={onSubmit}
      portalLabel="Employee Portal"
      description="Sign in to view your employee workspace."
    />);

    expect(screen.getByText('Employee Portal')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Too many failed attempts. Account locked.');
    const signingIn = screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement;
    expect(signingIn.disabled).toBe(true);
    await user.click(signingIn);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
