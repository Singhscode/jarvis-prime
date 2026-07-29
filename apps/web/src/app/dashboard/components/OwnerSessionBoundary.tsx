'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ownerEndpoint, ownerRequest } from '../lib/owner-api-client';
import type { ApiBody, OwnerBootstrap, OwnerDashboard } from '../lib/owner-contracts';

type OwnerRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type WorkspaceState = { bootstrap: OwnerBootstrap | null; dashboard: OwnerDashboard | null; loading: boolean; error: string; request: OwnerRequest; refresh: () => void; logout: () => void };
const WorkspaceContext = createContext<WorkspaceState | null>(null);

function displayError(caught: unknown, fallback: string) {
  if (caught instanceof TypeError) return 'Unable to reach the API. This may be caused by network connectivity or CORS configuration.';
  return caught instanceof Error ? caught.message : fallback;
}

export function useOwnerWorkspace() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error('Owner Workspace session is unavailable.');
  return state;
}

export default function OwnerSessionBoundary({ children }: { children: React.ReactNode }) {
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const [bootstrap, setBootstrap] = useState<OwnerBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const clear = useCallback((showLogin = true) => { accessToken.current = null; setBootstrap(null); setDashboard(null); setNeedsLogin(showLogin); }, []);

  const request = useCallback(<T,>(path: string, init: RequestInit = {}) => ownerRequest<T>(path, init, { accessToken, refreshPromise, clear }), [clear]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const bootstrapBody = await request('/api/owner-workspace/bootstrap') as ApiBody<OwnerBootstrap>;
      const dashboardBody = await request('/api/owner-workspace/dashboard') as ApiBody<OwnerDashboard>;
      setBootstrap(bootstrapBody.data); setDashboard(dashboardBody.data); setNeedsLogin(false);
    } catch (caught) { setError(displayError(caught, 'Unable to load Owner Workspace.')); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  const login = useCallback(async () => {
    setLoading(true); setError(''); clear(false);
    try {
      const response = await fetch(ownerEndpoint('/api/auth/login'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceName: 'Owner Workspace' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tokens?.accessToken) throw new Error(body.error?.message || 'Sign in failed.');
      accessToken.current = body.tokens.accessToken; setCredentials((value) => ({ ...value, password: '' })); await load();
    } catch (caught) { clear(); setError(displayError(caught, 'Sign in failed.')); setLoading(false); }
  }, [clear, credentials, load]);

  const logout = useCallback(async () => { try { await request('/api/auth/logout', { method: 'POST' }); } finally { clear(); setError(''); setLoading(false); } }, [clear, request]);
  const state = useMemo(() => ({ bootstrap, dashboard, loading, error, request, refresh: () => void load(), logout: () => void logout() }), [bootstrap, dashboard, error, load, loading, logout, request]);

  if (needsLogin) return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><p className="text-sm font-medium text-cyan-300">Owner Workspace</p><h1 className="mt-2 text-2xl font-semibold">Sign in to continue</h1><p className="mt-2 text-sm text-slate-300">Use your existing JARVIS PRIME account.</p>{error && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}<form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void login(); }}><label className="block text-sm font-medium">Email<input type="email" required autoComplete="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><label className="block text-sm font-medium">Password<input type="password" required autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label><button disabled={loading} className="w-full rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:opacity-60">{loading ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
  return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>;
}
