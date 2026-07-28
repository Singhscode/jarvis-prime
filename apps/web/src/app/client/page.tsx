'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ClientSignIn from './components/ClientSignIn';
import ClientWorkspace from './components/ClientWorkspace';

type Snapshot = {
  client: { id: string; name: string };
  projects: { id: string; name: string }[];
  tasks: { id: string; project_id: string; name: string; completed: boolean }[];
  documents: { id: string; project_id: string | null; title: string; document_type: string; created_at: string }[];
};
type ApiBody<T> = { success: true; data: T };
const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL;
const BACKEND_UNAVAILABLE_MESSAGE = 'Backend service is not running. Please start the API server.';

function displayError(caught: unknown, fallback: string) {
  if (caught instanceof TypeError) return BACKEND_UNAVAILABLE_MESSAGE;
  return caught instanceof Error ? caught.message : fallback;
}

export default function ClientPage() {
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const clearClientState = useCallback((showLogin = true) => {
    accessToken.current = null;
    setSnapshot(null);
    setNeedsLogin(showLogin);
  }, []);

  const refreshAccessToken = useCallback(() => {
    if (refreshPromise.current) return refreshPromise.current;
    const refresh = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (!response.ok) throw new Error('Please sign in to continue.');
        const body = await response.json();
        accessToken.current = body.accessToken;
        return body.accessToken as string;
      } catch (caught) {
        clearClientState();
        throw caught;
      } finally {
        refreshPromise.current = null;
      }
    })();
    refreshPromise.current = refresh;
    return refresh;
  }, [clearClientState]);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    let token = accessToken.current || await refreshAccessToken();
    const send = () => fetch(`${API_URL}${path}`, {
      ...init, credentials: 'include', headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    let response = await send();
    if (response.status === 401) {
      clearClientState();
      token = await refreshAccessToken();
      response = await send();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      clearClientState();
      throw new Error(body.error?.message || 'Unable to access the Client Portal.');
    }
    return body;
  }, [clearClientState, refreshAccessToken]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    setSnapshot(null);
    try {
      const body = await request('/api/client-portal') as ApiBody<Snapshot>;
      setSnapshot(body.data);
      setNeedsLogin(false);
    } catch (caught) {
      setError(displayError(caught, 'Unable to load the Client Portal.'));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  async function login() {
    setLoading(true);
    setError('');
    clearClientState(false);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceName: 'Client Portal' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tokens?.accessToken) throw new Error(body.error?.message || 'Sign in failed.');
      accessToken.current = body.tokens.accessToken;
      setCredentials((current) => ({ ...current, password: '' }));
      await loadSnapshot();
    } catch (caught) {
      clearClientState();
      setError(displayError(caught, 'Sign in failed.'));
      setLoading(false);
    }
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } finally {
      clearClientState();
      setError('');
      setLoading(false);
    }
  }

  async function downloadDocument(documentId: string) {
    try {
      const body = await request(`/api/client-portal/documents/${documentId}/download`) as ApiBody<{ url: string }>;
      window.location.assign(body.data.url);
    } catch (caught) {
      setError(displayError(caught, 'Document download failed.'));
    }
  }

  if (needsLogin) {
    return <ClientSignIn credentials={credentials} error={error} loading={loading} onChange={setCredentials} onSubmit={() => void login()} />;
  }
  return <ClientWorkspace snapshot={snapshot} loading={loading} error={error} onRefresh={() => void loadSnapshot()} onLogout={() => void logout()} onDocumentDownload={downloadDocument} />;
}
