'use client';

import { useEffect, useState } from 'react';

export default function AccountActivationPage() {
  const [message, setMessage] = useState('Verifying your email address…');

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setMessage('This activation link is invalid or expired.'); return; }
    const apiUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
    if (!apiUrl) { setMessage('Account activation is temporarily unavailable.'); return; }
    void fetch(`${apiUrl}/api/auth/activate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('invalid');
      setMessage('Email verified. Redirecting to sign in…');
      window.setTimeout(() => window.location.assign('/dashboard'), 800);
    }).catch(() => setMessage('This activation link is invalid or expired.'));
  }, []);

  return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100">{message}</p></main>;
}
