'use client';

import { FormEvent, useState } from 'react';

const SUCCESS_MESSAGE = 'If this email can be registered, check your inbox for next steps.';

export default function RegistrationPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    const apiUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
    if (!apiUrl) { setError('Registration is temporarily unavailable.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setPassword('');
      setConfirmation('');
      if (response.status === 201 || response.status === 409) { setSubmitted(true); return; }
      setError(response.status === 400
        ? 'Please review your email and password and try again.'
        : response.status === 429 ? 'Too many registration attempts. Try again later.'
          : 'Registration is temporarily unavailable. Please try again later.');
    } catch {
      setPassword('');
      setConfirmation('');
      setError('Registration is temporarily unavailable. Please try again later.');
    } finally { setSubmitting(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-8 text-slate-100">
    <section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/30 sm:p-8">
      <p className="text-sm font-medium text-cyan-400">JARVIS PRIME</p><h1 className="mt-2 text-3xl font-semibold">Create an account</h1>
      {submitted ? <p role="status" className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100">{SUCCESS_MESSAGE}</p> : <form className="mt-6 space-y-4" onSubmit={register}>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}
        <label className="block text-sm font-medium">Email<input className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="block text-sm font-medium">Confirm password<input className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
      </form>}
    </section>
  </main>;
}
