'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EmployeeSignIn from './components/EmployeeSignIn';
import EmployeeWorkspace from './components/EmployeeWorkspace';

type Task = { id: string; project_id: string; name: string; completed: boolean };
type PortalSnapshot = {
  projects: { id: string; client_id: string; name: string }[];
  tasks: Task[];
  clients: { id: string; name: string; created_at: string }[];
  leads: { id: string; contact_id: string; created_at: string }[];
};
type ApiBody<T> = { success: true; data: T };
const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL;

export default function EmployeePage() {
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string> | null>(null);
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const request = useCallback(async (path: string, init: RequestInit = {}) => {

    let token = accessToken.current || await refreshAccessToken();
    const send = () => fetch(`${API_URL}${path}`, {
      ...init, credentials: 'include', headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    let response = await send();
    if (response.status === 401) {
      accessToken.current = null;
      token = await refreshAccessToken();
      response = await send();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || 'Request failed.');
    return body;
  }, [refreshAccessToken]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const body = await request('/api/employee-portal') as ApiBody<PortalSnapshot>;
      setSnapshot(body.data); setNeedsLogin(false);
    } catch (caught) {
      if (!accessToken.current) setNeedsLogin(true);
      setError(caught instanceof Error ? caught.message : 'Unable to load portal.');
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  async function login() {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceName: 'Employee Portal' }),
      });
      const body = await response.json();
      if (!response.ok || !body.tokens?.accessToken) throw new Error(body.error?.message || 'Login failed.');
      accessToken.current = body.tokens.accessToken;
      setCredentials((current) => ({ ...current, password: '' }));
      setNeedsLogin(false);
      await loadSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed.');
      setLoading(false);
    }
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } finally {
      accessToken.current = null; setSnapshot(null); setNeedsLogin(true); setError('');
    }
  }

  async function updateTask(task: Task, justification: string) {
    try {
      await request(`/api/employee-portal/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed, justification }),
      });
      await loadSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update task.');
    }
  }

  if (needsLogin) return <EmployeeSignIn credentials={credentials} error={error} loading={loading} onChange={setCredentials} onSubmit={() => void login()} />;
  return <EmployeeWorkspace snapshot={snapshot} loading={loading} error={error} onRefresh={() => void loadSnapshot()} onLogout={() => void logout()} onTaskChange={updateTask} />;
}
