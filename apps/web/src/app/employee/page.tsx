'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Task = { id: string; project_id: string; name: string; completed: boolean };
type PortalSnapshot = {
  projects: { id: string; client_id: string; name: string }[];
  tasks: Task[];
  clients: { id: string; name: string; created_at: string }[];
  leads: { id: string; contact_id: string; created_at: string }[];
};
type ApiBody<T> = { success: true; data: T };
const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';

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
      ...init, credentials: 'include',
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
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
      if (!response.ok || !body.tokens?.accessToken) {
        throw new Error(body.error?.message || 'Login failed.');
      }
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

  async function toggleTask(task: Task) {
    const justification = window.prompt(
      task.completed ? 'Why are you reopening this task?' : 'Completion justification:'
    );
    if (!justification?.trim()) return;
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

  if (needsLogin) return <main className="mx-auto max-w-md space-y-4 px-6 py-12">
    <h1 className="text-3xl font-semibold">Employee Portal</h1>
    {error && <p className="text-red-600">{error}</p>}
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void login(); }}>
      <input className="w-full rounded border p-2" type="email" required placeholder="Email"
        value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} />
      <input className="w-full rounded border p-2" type="password" required placeholder="Password"
        value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} />
      <button className="rounded border px-3 py-2" disabled={loading}>Sign in</button>
    </form>
  </main>;

  return <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
    <header className="flex items-center justify-between">
      <h1 className="text-3xl font-semibold">Employee Portal</h1>
      <div className="space-x-2">
        <button className="rounded border px-3 py-2" onClick={() => void loadSnapshot()}>Refresh</button>
        <button className="rounded border px-3 py-2" onClick={() => void logout()}>Logout</button>
      </div>
    </header>
    {loading && <p>Loading assigned work…</p>}
    {error && <p className="text-red-600">{error}</p>}
    {snapshot && <>
      <section><h2 className="mb-3 text-xl font-medium">Projects</h2><ul>
        {snapshot.projects.map((project) => <li key={project.id}>{project.name}</li>)}
        {!snapshot.projects.length && <li>No assigned projects.</li>}
      </ul></section>
      <section><h2 className="mb-3 text-xl font-medium">Tasks</h2><ul className="space-y-3">
        {snapshot.tasks.map((task) => <li className="flex items-center gap-3" key={task.id}>
          <span className={task.completed ? 'line-through' : ''}>{task.name}</span>
          <button className="rounded border px-2 py-1" onClick={() => void toggleTask(task)}>
            {task.completed ? 'Reopen' : 'Complete'}
          </button>
        </li>)}
        {!snapshot.tasks.length && <li>No assigned tasks.</li>}
      </ul></section>
      <section><h2 className="mb-3 text-xl font-medium">Clients</h2><ul>
        {snapshot.clients.map((client) => <li key={client.id}>{client.name}</li>)}
        {!snapshot.clients.length && <li>No clients.</li>}
      </ul></section>
      <section><h2 className="mb-3 text-xl font-medium">Leads</h2><ul>
        {snapshot.leads.map((lead) => <li key={lead.id}>Lead {lead.id}</li>)}
        {!snapshot.leads.length && <li>No active leads.</li>}
      </ul></section>
    </>}
  </main>;
}