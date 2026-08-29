'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePortalSession } from '../components/PortalSessionBoundary';
import ClientSignIn from '../client/components/ClientSignIn';

type Task = { id: string; project_id: string; name: string; completed: boolean };
type PortalSnapshot = {
  projects: { id: string; client_id: string; name: string }[];
  tasks: Task[];
  clients: { id: string; name: string; created_at: string }[];
  leads: { id: string; contact_id: string; created_at: string }[];
};
type ApiBody<T> = { success: true; data: T };

export default function EmployeePage() {
  const {
    credentials, setCredentials, needsLogin, loading: authenticationLoading, error, setError, request, login, logout,
  } = usePortalSession();
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    setSnapshot(null);
    try {
      const body = await request<ApiBody<PortalSnapshot>>('/api/employee-portal');
      setSnapshot(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load portal.');
    } finally {
      setLoading(false);
    }
  }, [request, setError]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);
  useEffect(() => { if (needsLogin) setSnapshot(null); }, [needsLogin]);

  async function signInAndLoad() {
    try {
      await login();
      await loadSnapshot();
    } catch {
      // The shared session boundary exposes the authentication error to the sign-in view.
    }
  }

  async function signOut() {
    await logout();
    setSnapshot(null);
    setLoading(false);
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

  if (needsLogin) {
    return <ClientSignIn
      credentials={credentials}
      error={error}
      loading={authenticationLoading || loading}
      onChange={setCredentials}
      onSubmit={() => void signInAndLoad()}
      portalLabel="Employee Portal"
      description="Sign in to view your employee workspace."
    />;
  }

  return <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
    <header className="flex items-center justify-between">
      <h1 className="text-3xl font-semibold">Employee Portal</h1>
      <div className="space-x-2">
        <Link href="/employee/automations" className="inline-block rounded border px-3 py-2">Automations</Link>
        <Link href="/employee/communications" className="inline-block rounded border px-3 py-2">Communications</Link>
        <button className="rounded border px-3 py-2" onClick={() => void loadSnapshot()}>Refresh</button>
        <button className="rounded border px-3 py-2" onClick={() => void signOut()}>Logout</button>
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
