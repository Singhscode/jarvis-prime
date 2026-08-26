import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientLayout from './layout';
import ClientPage from './page';

const snapshot = { client: { id: 'client-1', name: 'Acme' }, projects: [], tasks: [], documents: [{ id: 'document-1', project_id: null, title: 'Delivery', document_type: 'report', created_at: '2026-07-18T00:00:00.000Z' }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const nativeFetch = globalThis.fetch;

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

function renderClientPortal() {
  return render(<ClientLayout><ClientPage /></ClientLayout>);
}

describe('ClientPage shared session boundary', () => {
  it('refreshes in memory, retries one protected 401, and does not persist the snapshot', async () => {
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = responses(
      json({ accessToken: 'token-one' }), json({ error: { message: 'Expired' } }, 401),
      json({ accessToken: 'token-two' }), json({ success: true, data: snapshot }),
    );
    renderClientPortal();
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(persist).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Communications' }).getAttribute('href')).toBe('/client/communications');
  });

  it('uses the shared login flow after refresh failure and clears the page snapshot on logout', async () => {
    const user = userEvent.setup();
    const fetch = responses(
      json({ error: { message: 'No session' } }, 401),
      json({ tokens: { accessToken: 'login-token' } }), json({ success: true, data: snapshot }),
      json({ success: true }),
    );
    renderClientPortal();
    await screen.findByRole('heading', { name: 'Welcome back' });
    await user.type(screen.getByLabelText('Email'), 'client@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    const loginCall = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[1];
    expect(JSON.parse(loginCall[1]?.body as string)).toMatchObject({ email: 'client@example.test', password: 'password', deviceName: 'Client Portal' });
  });

  it('clears client state after a portal denial without prefetching document URLs', async () => {
    const user = userEvent.setup();
    const fetch = responses(
      json({ accessToken: 'token' }), json({ success: true, data: snapshot }),
      json({ error: { message: 'Membership no longer permits access.' } }, 403),
    );
    renderClientPortal();
    await screen.findByRole('heading', { name: 'Acme' });
    expect((fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).every(
      ([url]) => !url.toString().includes('/documents/document-1/download')
    )).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.queryByText('Acme')).toBeNull();
  });
});
