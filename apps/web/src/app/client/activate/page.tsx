'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ClientSignIn from '../components/ClientSignIn';

const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL;

type Phase = 'capturing' | 'sign-in' | 'activating' | 'success' | 'error';

export default function ClientActivationPage() {
  const invitation = useRef<string | null>(null);
  const captured = useRef(false);
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [phase, setPhase] = useState<Phase>('capturing');
  const [error, setError] = useState('');

  const refreshAccessToken = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    const refresh = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (!response.ok) throw new Error('Authentication required.');
        const body = await response.json();
        accessToken.current = body.accessToken;
        return body.accessToken as string;
      } finally {
        refreshPromise.current = null;
      }
    })();
    refreshPromise.current = refresh;
    return refresh;
  }, []);

  const requestActivation = useCallback(async () => {
    if (!invitation.current) throw new Error('This activation link is invalid or expired.');
    let token = accessToken.current || await refreshAccessToken();
    const send = () => fetch(`${API_URL}/api/client-portal/activate`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ invitation: invitation.current }),
    });
    let response = await send();
    if (response.status === 401) {
      accessToken.current = null;
      token = await refreshAccessToken();
      response = await send();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.data?.activated) throw new Error('This activation link is invalid or expired.');
  }, [refreshAccessToken]);

  const activate = useCallback(async () => {
    setPhase('activating');
    setError('');
    try {
      await requestActivation();
      invitation.current = null;
      setPhase('success');
    } catch (caught) {
      accessToken.current = null;
      setPhase('error');
      setError(caught instanceof Error ? caught.message : 'This activation link is invalid or expired.');
    }
  }, [requestActivation]);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const value = new URLSearchParams(window.location.search).get('invitation');
    window.history.replaceState({}, '', '/client/activate');
    if (!value) {
      setPhase('error');
      setError('This activation link is invalid or expired.');
      return;
    }
    invitation.current = value;
    void (async () => {
      try {
        await refreshAccessToken();
        await activate();
      } catch {
        setPhase('sign-in');
      }
    })();
  }, [activate, refreshAccessToken]);

  async function login() {
    setPhase('activating');
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceName: 'Client Portal activation' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tokens?.accessToken) throw new Error(body.error?.message || 'Sign in failed.');
      accessToken.current = body.tokens.accessToken;
      setCredentials((current) => ({ ...current, password: '' }));
      await activate();
    } catch (caught) {
      accessToken.current = null;
      setPhase('sign-in');
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
    }
  }

  if (phase === 'capturing' || phase === 'activating') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100" aria-busy="true">
      <p className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm">{phase === 'capturing' ? 'Preparing secure activation…' : 'Activating your Client Portal access…'}</p>
    </main>;
  }
  if (phase === 'success') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8 text-center shadow-2xl shadow-cyan-950/30">
        <p className="text-sm font-medium text-cyan-400">Client Portal</p><h1 className="mt-2 text-3xl font-semibold">Access activated</h1>
        <p className="mt-3 text-sm text-slate-400">Your Client Portal access is ready.</p>
        <a href="/client" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300">Continue to Client Portal</a>
      </section>
    </main>;
  }
  return <ClientSignIn credentials={credentials} error={error} loading={false} onChange={setCredentials} onSubmit={() => void login()} heading="Activate your access" description="Sign in with the active account that received this invitation." />;
}
