'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

const apiUrl = (path: string) => `${process.env.NEXT_PUBLIC_ENGINE_URL || ''}${path}`;

function EmployeeActivationForm() {
  const search = useSearchParams(); const email = search.get('email') || ''; const token = search.get('token') || '';
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [complete, setComplete] = useState(false); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!email || !token) { setError('This employee setup link is invalid or expired.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl('/api/auth/password-reset/confirm'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, resetToken: token, newPassword: password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || 'Unable to set your password.');
      setComplete(true); setPassword(''); setConfirm('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to set your password.'); }
    finally { setSubmitting(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><p className="text-sm font-medium text-cyan-300">JARVIS PRIME</p><h1 className="mt-2 text-2xl font-semibold">Set up your employee account</h1>{complete ? <p role="status" className="mt-4 rounded-lg border border-cyan-300/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">Your password is set. You can now sign in through the Employee Portal.</p> : <form className="mt-5 space-y-4" onSubmit={submit}><p className="text-sm text-slate-300">Use a password with at least 12 characters, upper- and lower-case letters, a number, and a special character.</p>{error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">{error}</p>}<label className="block text-sm">New password<input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label><label className="block text-sm">Confirm password<input required minLength={12} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label><button disabled={submitting} className="w-full rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60">{submitting ? 'Setting up…' : 'Set password'}</button></form>}</section></main>;
}


export default function EmployeeActivationPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading account setup…</main>}><EmployeeActivationForm /></Suspense>;
}
