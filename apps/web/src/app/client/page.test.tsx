import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientPage from './page';
import { FileJson2Icon } from 'lucide-react';

const snapshot = { client: { id: 'client-1', name: 'Acme' }, projects: [], tasks: [], documents: [{ id: 'document-1', project_id: null, title: 'Delivery', document_type: 'report', created_at: '2026-07-18T00:00:00.000Z' }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let nativeFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = nativeFetch;
  vi.restoreAllMocks();
});

function responses(...items: Response[]) {
  const fetch = vi.fn(async () => items.shift() || json({}, 500));
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}

describe('ClientPage session boundary', () => {
  it('refreshes in memory, retries one protected 401, and does not persist the snapshot', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    const setSession = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = responses(
      json({ accessToken: 'token-one' }), json({ error: { message: 'Expired' } }, 401),
      json({ accessToken: 'token-two' }), json({ success: true, data: snapshot }),
    );
    render(<ClientPage />);
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(setLocal).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it('uses existing login after refresh failure and clears workspace on logout', async () => {
    const user = userEvent.setup();
    const fetch = responses(
      json({ error: { message: 'No session' } }, 401),
      json({ tokens: { accessToken: 'login-token' } }), json({ success: true, data: snapshot }),
      json({ success: true }),
    );
    render(<ClientPage />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    await user.type(screen.getByLabelText('Email'), 'client@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    const loginCall = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[1];
    const loginBody = JSON.parse(loginCall[1]?.body as string);
    expect(loginBody).toMatchObject({ email: 'client@example.test', password: 'password', deviceName: 'Client Portal' });
  });

  it('shows friendly recovery guidance when the backend is unavailable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    render(<ClientPage />);
    expect(await screen.findByText('Backend service is not running. Please start the API server.')).toBeTruthy();
  });

  it('clears client state after a portal denial without prefetching document URLs', async () => {
    const user = userEvent.setup();
    const fetch = responses(
      json({ accessToken: 'token' }), json({ success: true, data: snapshot }),
      json({ error: { message: 'Membership no longer permits access.' } }, 403),
    );
    render(<ClientPage />);
    await screen.findByRole('heading', { name: 'Acme' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).every(
      ([url]) => !url.toString().includes('/documents/document-1/download')
    )).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });
});
