import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RegistrationPage from './page';

const nativeFetch = globalThis.fetch;
const originalEngineUrl = process.env.NEXT_PUBLIC_ENGINE_URL;

function fillRegistrationForm() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPassword99!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'StrongPassword99!' } });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENGINE_URL = 'https://engine.example.test';
  window.history.pushState({}, '', '/register');
});
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; process.env.NEXT_PUBLIC_ENGINE_URL = originalEngineUrl; });

describe('RegistrationPage', () => {
  it('posts only email and password, then shows a sessionless success message', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<RegistrationPage />); fillRegistrationForm(); fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('status')).textContent).toBe('If this email can be registered, check your inbox for next steps.');
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.example.test/api/auth/register');
    expect(JSON.parse(options.body as string)).toEqual({ email: 'person@example.test', password: 'StrongPassword99!' });
    expect(document.body.textContent).not.toContain('StrongPassword99!');
    expect(document.body.textContent).not.toMatch(/token/i);
    expect(window.location.pathname).toBe('/register');
  });

  it('uses the same generic success path for a 409 response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 409 })) as unknown as typeof globalThis.fetch;
    render(<RegistrationPage />); fillRegistrationForm(); fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('status')).textContent).toBe('If this email can be registered, check your inbox for next steps.');
  });

  it('prevents submission when passwords do not match', async () => {
    const fetch = vi.fn(); globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<RegistrationPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPassword99!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'DifferentPassword99!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords do not match.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('disables the form while pending and renders a safe API error', async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    render(<RegistrationPage />); fillRegistrationForm(); fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((screen.getByRole('button', { name: 'Creating account…' }) as HTMLButtonElement).disabled).toBe(true);
    resolveResponse(new Response('{}', { status: 429 }));
    expect((await screen.findByRole('alert')).textContent).toBe('Too many registration attempts. Try again later.');
  });
});
