import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.hoisted(() => { process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test'; });
import EmployeeActivationPage from './page';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});
const nativeFetch = globalThis.fetch;
let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.pushState({}, '', '/employee/activate?invitation=raw-employee-invitation');
  replaceState = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  cleanup();
  globalThis.fetch = nativeFetch;
  replaceState.mockRestore();
  vi.restoreAllMocks();
});

describe('EmployeeActivationPage', () => {
  it('scrubs the URL, lets the employee choose a password, and uses the public activation API once', async () => {
    const fetch = vi.fn(async () => json({
      success: true,
      message: 'Employee access activated.',
      employee: { id: 'employee-1', status: 'active' },
    }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();
    render(<EmployeeActivationPage />);

    await screen.findByRole('heading', { name: 'Activate Employee Portal' });
    expect(replaceState).toHaveBeenCalledWith({}, '', '/employee/activate');
    expect(window.location.search).toBe('');
    await user.type(screen.getByLabelText('Password'), 'Unique!Employee2026');
    await user.type(screen.getByLabelText('Confirm password'), 'Unique!Employee2026');
    await user.click(screen.getByRole('button', { name: 'Activate access' }));
    expect(await screen.findByRole('heading', { name: 'Employee access activated' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Employee Portal' }).getAttribute('href')).toBe('/employee');
    const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].toString()).toBe('http://api.test/api/auth/employee-invitations/activate');
    expect(JSON.parse(calls[0][1]?.body as string)).toEqual({
      invitation: 'raw-employee-invitation',
      password: 'Unique!Employee2026',
    });
    expect(document.body.textContent).not.toContain('raw-employee-invitation');
  });

  it('shows one generic error for expired, revoked, consumed, or unknown invitations', async () => {
    globalThis.fetch = vi.fn(async () => json({
      error: { code: 'INVALID_EMPLOYEE_INVITATION', message: 'database-specific reason' },
    }, 400)) as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();
    render(<EmployeeActivationPage />);
    await screen.findByRole('heading', { name: 'Activate Employee Portal' });
    await user.type(screen.getByLabelText('Password'), 'Unique!Employee2026');
    await user.type(screen.getByLabelText('Confirm password'), 'Unique!Employee2026');
    await user.click(screen.getByRole('button', { name: 'Activate access' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This activation link is invalid or expired.');
    expect(alert.textContent).not.toContain('database-specific');
  });

  it('does not send mismatched passwords', async () => {
    const fetch = vi.fn();
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const user = userEvent.setup();
    render(<EmployeeActivationPage />);
    await screen.findByRole('heading', { name: 'Activate Employee Portal' });
    await user.type(screen.getByLabelText('Password'), 'Unique!Employee2026');
    await user.type(screen.getByLabelText('Confirm password'), 'Different!Employee2026');
    await user.click(screen.getByRole('button', { name: 'Activate access' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords do not match.');
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });
});