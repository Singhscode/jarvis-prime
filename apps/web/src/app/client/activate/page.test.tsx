import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientActivationPage from './page';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const nativeFetch = globalThis.fetch;
let replaceState: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  cleanup();
  globalThis.fetch = nativeFetch;
  replaceState.mockRestore();
});

beforeEach(() => {
  window.history.pushState({}, '', '/client/activate?invitation=raw-invitation');
  replaceState = vi.spyOn(window.history, 'replaceState');
});

function responses(...items: Response[]) {
  const fetch = vi.fn(async () => items.shift() || json({}, 500));
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}

describe('ClientActivationPage', () => {
  it('captures the invitation transiently, cleans the URL, then activates after existing-session refresh', async () => {
    const fetch = responses(
      json({ accessToken: 'token-one' }), json({ error: { message: 'expired' } }, 401),
      json({ accessToken: 'token-two' }), json({ success: true, data: { activated: true } }),
    );
    render(<ClientActivationPage />);
    expect(await screen.findByRole('heading', { name: 'Access activated' })).toBeTruthy();
    expect(replaceState).toHaveBeenCalledWith({}, '', '/client/activate');
    expect(window.location.search).toBe('');
    const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const activationCalls = calls.filter(([url]) => String(url).endsWith('/api/client-portal/activate'));
    expect(activationCalls).toHaveLength(2);
    expect(JSON.parse(activationCalls[0][1]?.body as string)).toEqual({ invitation: 'raw-invitation' });
  });

  it('uses the existing login endpoint when refresh is unavailable', async () => {
    const user = userEvent.setup();
    const fetch = responses(
      json({ error: { message: 'No session' } }, 401),
      json({ tokens: { accessToken: 'login-token' } }), json({ success: true, data: { activated: true } }),
    );
    render(<ClientActivationPage />);
    await screen.findByRole('heading', { name: 'Activate your access' });
    await user.type(screen.getByLabelText('Email'), 'client@example.test');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Access activated' })).toBeTruthy();
    expect(JSON.parse((fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[1][1]?.body as string)).toMatchObject({
      email: 'client@example.test', password: 'password', deviceName: 'Client Portal activation',
    });
  });

  it('uses one generic error for invalid activation states without exposing the invitation', async () => {
    responses(json({ accessToken: 'token' }), json({ error: { message: 'membership belongs to a different client' } }, 400));
    render(<ClientActivationPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This activation link is invalid or expired.');
    expect(alert.textContent).not.toContain('different client');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Activate your access' })).toBeTruthy());
  });
});
