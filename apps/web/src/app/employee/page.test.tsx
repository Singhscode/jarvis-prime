import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('clears employee snapshots after terminal 403 denial', async () => {
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
    expect(await screen.findByPlaceholderText('Email')).toBeTruthy();
    expect(screen.queryByText('Launch')).toBeNull();
  });
});
