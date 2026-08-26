'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type PortalSession = {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  credentials: { email: string; password: string };
  setCredentials: (value: { email: string; password: string }) => void;
  needsLogin: boolean;
  loading: boolean;
  error: string;
  setError: (value: string) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const PortalSessionContext = createContext<PortalSession | null>(null);
const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';

export function usePortalSession() {
  const value = useContext(PortalSessionContext);
  if (!value) throw new Error('Portal session is unavailable.');
  return value;
}

export function PortalSessionBoundary({ portalName, children }: { portalName: string; children: React.ReactNode }) {
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clear = useCallback(() => {
    accessToken.current = null;
    setNeedsLogin(true);
  }, []);

  const refreshAccessToken = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    const refresh = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || typeof body.accessToken !== 'string') throw new Error(body.error?.message || 'Please sign in to continue.');
        accessToken.current = body.accessToken;
        return body.accessToken as string;
      } catch (caught) {
        clear();
        throw caught;
      } finally { refreshPromise.current = null; }
    })();
    refreshPromise.current = refresh;
    return refresh;
  }, [clear]);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    let token = accessToken.current || await refreshAccessToken();
    const send = () => fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    let response = await send();
    if (response.status === 401) {
      accessToken.current = null;
      token = await refreshAccessToken();
      response = await send();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clear();
      throw new Error(body.error?.message || 'Request failed.');
    }
    return body as T;
  }, [clear, refreshAccessToken]);

  const login = useCallback(async () => {
    setLoading(true); setError(''); accessToken.current = null; setNeedsLogin(false);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceName: portalName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.tokens?.accessToken !== 'string') throw new Error(body.error?.message || 'Sign in failed.');
      accessToken.current = body.tokens.accessToken;
      setCredentials((value) => ({ ...value, password: '' }));
      setNeedsLogin(false);
    } catch (caught) {
      clear();
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
      throw caught;
    } finally { setLoading(false); }
  }, [clear, credentials, portalName]);

  const logout = useCallback(async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* Logout always clears local session state. */ }
    finally { clear(); setError(''); setLoading(false); }
  }, [clear, request]);

  const value = useMemo(() => ({ request, credentials, setCredentials, needsLogin, loading, error, setError, login, logout }),
    [credentials, error, loading, login, logout, needsLogin, request]);
  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function PortalSignIn({ label, description }: { label: string; description: string }) {
  const { credentials, setCredentials, error, loading, login } = usePortalSession();
  return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-8 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900 p-6 shadow-2xl sm:p-8"><p className="text-sm font-medium text-cyan-400">JARVIS PRIME</p><h1 className="mt-2 text-3xl font-semibold">Sign in to continue</h1><p className="mt-2 text-sm text-slate-400">{description}</p>{error && <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">{error}</p>}<form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void login().catch(() => undefined); }}><label className="block text-sm font-medium">Email<input type="email" required autoComplete="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-400" /></label><label className="block text-sm font-medium">Password<input type="password" required autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-400" /></label><button disabled={loading} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">{loading ? 'Signing in…' : `Sign in to ${label}`}</button></form></section></main>;
}
