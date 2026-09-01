'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerEmployeeDetail as EmployeeDetail } from '../lib/owner-contracts';

type PasswordResetResponse = { delivery: 'sent' | 'dry_run' };

export default function OwnerEmployeeDetail({ employeeId }: { employeeId: string }) {
  const { request } = useOwnerWorkspace();
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetNotice, setResetNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
      const body = await request<ApiBody<EmployeeDetail>>(`/api/owner-workspace/employees/${employeeId}${suffix}`);
      setDetail(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load employee details.');
    } finally {
      setLoading(false);
    }
  }, [cursor, employeeId, request]);

  useEffect(() => { void load(); }, [load]);

  async function sendPasswordReset() {
    setResetLoading(true);
    setResetError('');
    try {
      await request<ApiBody<PasswordResetResponse>>(`/api/owner-workspace/employees/${employeeId}/password-reset`, { method: 'POST' });
      setResetOpen(false);
      setResetNotice('Password reset link sent successfully.');
    } catch (caught) {
      setResetError(caught instanceof Error ? caught.message : 'Password reset link could not be sent. Please try again later.');
    } finally {
      setResetLoading(false);
    }
  }

  if (loading) return <section aria-busy="true" className="space-y-5"><div className="h-10 w-64 animate-pulse rounded bg-slate-800" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-900" />)}</section>;
  if (error && !detail) return <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-950/30 p-5"><h1 className="text-xl font-semibold">Employee could not load</h1><p className="mt-2 text-sm">{error}</p><button onClick={() => void load()} className="mt-4 underline">Try again</button></section>;

  const employee = detail?.employee;
  const assignments = detail?.assignments.items || [];
  const canResetPassword = employee?.status === 'active';

  return <section>
    <Link href="/dashboard/employees" className="text-sm text-cyan-300 hover:underline">← Employees</Link>
    <header className="mt-4"><p className="text-sm font-medium text-cyan-300">Employee details</p><h1 className="mt-1 text-3xl font-semibold">{employee?.fullName || employee?.email}</h1><p className="mt-2 text-sm text-slate-300">{employee?.email}</p></header>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></div>}
    {resetNotice && <p role="status" className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-950/30 p-4 text-sm text-cyan-100">{resetNotice}</p>}
    {canResetPassword && <section className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-950/20 p-5"><h2 className="text-lg font-semibold text-cyan-100">Employee actions</h2><p className="mt-2 text-sm text-slate-300">Send this active employee a secure link to choose a new password.</p><button type="button" disabled={resetLoading} onClick={() => { setResetError(''); setResetOpen(true); }} className="mt-4 rounded-lg border border-cyan-300 px-4 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">Send Password Reset Link</button></section>}
    {employee?.status === 'pending_verification' && <p className="mt-6 text-sm text-slate-400">This employee has not completed account setup. Use the invitation workflow to resend their setup link.</p>}
    <div className="mt-6 grid gap-4 md:grid-cols-3"><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Current workload</h2><p className="mt-2 text-sm">{employee?.workload.open} open · {employee?.workload.completed} completed · {employee?.workload.assigned} assigned</p><p className="mt-2 text-xs text-slate-400">{employee?.workload.definition}</p></section><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Availability</h2><p className="mt-2 text-sm text-slate-300">Unavailable — {employee?.availability.reason}</p></section><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">Performance summary</h2><p className="mt-2 text-sm text-slate-300">Unavailable — {employee?.performance.reason}</p></section></div>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Current project participation</h2>{!detail?.projects.length ? <p className="mt-3 text-sm text-slate-300">No projects are referenced by the current assignment page.</p> : <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{detail.projects.map((project) => <li key={project.id}>{project.name} {project.client ? `· ${project.client.name}` : ''}</li>)}</ul>}</section>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Current assignments</h2>{!assignments.length ? <p className="mt-3 text-sm text-slate-300">No direct task assignments are recorded.</p> : <ul className="mt-4 divide-y divide-slate-800">{assignments.map((task) => <li key={task.id} className="py-3"><p className="font-medium">{task.name}</p><p className="text-sm text-slate-400">{task.project.name} · {task.completed ? 'Completed' : 'Open'}</p></li>)}</ul>}<div className="mt-4 flex justify-end">{detail?.assignments.pageInfo.hasNextPage && <button onClick={() => setCursor(detail.assignments.pageInfo.nextCursor)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300">Next assignments</button>}</div></section>
    {resetOpen && employee && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !resetLoading) setResetOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="employee-password-reset-title" onKeyDown={(event) => { if (event.key === 'Escape' && !resetLoading) setResetOpen(false); }} className="w-full max-w-lg rounded-2xl border border-cyan-300/30 bg-slate-900 p-6 shadow-2xl"><h2 id="employee-password-reset-title" className="text-xl font-semibold text-cyan-100">Send password reset link?</h2><p className="mt-3 text-sm text-slate-200">A secure password reset link will be sent to this employee. The employee will create their own new password.</p><p className="mt-3 text-sm text-slate-400">{employee.fullName || employee.email}</p>{resetError && <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{resetError}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={resetLoading} onClick={() => setResetOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-300 disabled:opacity-60">Cancel</button><button type="button" disabled={resetLoading} onClick={() => void sendPasswordReset()} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60">{resetLoading ? 'Sending…' : 'Send Reset Link'}</button></div></section></div>}
  </section>;
}
