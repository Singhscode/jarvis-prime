import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AccountActivationPage from './page';

const nativeFetch = globalThis.fetch;
const originalEngineUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
let replaceState: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  cleanup();
  globalThis.fetch = nativeFetch;
  replaceState.mockRestore();
  process.env.NEXT_PUBLIC_ENGINE_URL = originalEngineUrl;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENGINE_URL = 'https://engine.example.test';
  window.history.pushState({}, '', '/activate#token=' + 'A'.repeat(43));
  replaceState = vi.spyOn(window.history, 'replaceState');
});

describe('AccountActivationPage', () => {
  it('strips the fragment before posting only the opaque capability', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<AccountActivationPage />);

    expect(await screen.findByText('Email verified. Redirecting to sign in…')).toBeTruthy();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/activate');
    expect(window.location.hash).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.example.test/api/auth/activate');
    expect(JSON.parse(options.body as string)).toEqual({ token: 'A'.repeat(43) });
  });

  it('shows one generic error and never exposes a rejected capability', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'account has a portal membership' },
    }), { status: 400 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<AccountActivationPage />);

    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('This activation link is invalid or expired.');
    expect(status.textContent).not.toContain('membership');
    expect(status.textContent).not.toContain('A'.repeat(43));
    expect(window.location.hash).toBe('');
  });
});
