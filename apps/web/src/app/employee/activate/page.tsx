'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Phase = 'capturing' | 'ready' | 'activating' | 'success' | 'error';
const API_URL = process.env.NEXT_PUBLIC_ENGINE_URL;
const GENERIC_ERROR = 'This activation link is invalid or expired.';

export default function EmployeeActivationPage() {
  const invitation = useRef<string | null>(null);
  const captured = useRef(false);
  const [phase, setPhase] = useState<Phase>('capturing');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const value = new URLSearchParams(window.location.search).get('invitation');
    window.history.replaceState({}, '', '/employee/activate');
    if (!value) {
      setError(GENERIC_ERROR);
      setPhase('error');
      return;
    }
    invitation.current = value;
    setPhase('ready');
  }, []);

  async function activate() {
    if (!invitation.current || !API_URL) {
      setError(GENERIC_ERROR);
      setPhase('error');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setPhase('activating');
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/employee-invitations/activate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: invitation.current, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const passwordError = typeof body.error?.code === 'string' && body.error.code.startsWith('VALIDATION_PASSWORD_');
        throw new Error(passwordError ? body.error.message : GENERIC_ERROR);
      }
      invitation.current = null;
      setPassword('');
      setConfirmation('');
      setPhase('success');
    } catch (caught) {
      setPassword('');
      setConfirmation('');
      setError(caught instanceof Error ? caught.message : GENERIC_ERROR);
      setPhase('error');
    }
  }

  if (phase === 'capturing' || phase === 'activating') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100" aria-busy="true">
      <p className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm">{phase === 'capturing' ? 'Preparing secure activation…' : 'Activating Employee Portal access…'}</p>
    </main>;
  }

  if (phase === 'success') {
    return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8 text-center">
        <h1 className="text-2xl font-semibold">Employee access activated</h1>
        <p className="mt-3 text-sm text-slate-300">Your password is set. Sign in through the existing Employee Portal.</p>
        <Link href="/employee" className="mt-6 inline-flex rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">Open Employee Portal</Link>
      </section>
    </main>;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-slate-100">
    <section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/80 p-8">
      <h1 className="text-2xl font-semibold">Activate Employee Portal</h1>
      <p className="mt-3 text-sm text-slate-300">Choose your own password to activate this single-use invitation.</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void activate(); }}>
        <label className="block text-sm">Password<input aria-label="Password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>
        <label className="block text-sm">Confirm password<input aria-label="Confirm password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-300" /></label>
        <p className="text-xs text-slate-400">Use 12–128 characters with uppercase, lowercase, a number, and a special character.</p>
        <button disabled={phase === 'error' && error === GENERIC_ERROR} className="w-full rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-cyan-200">Activate access</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
    </section>
  </main>;
}