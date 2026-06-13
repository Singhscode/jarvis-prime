'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PortalAuth() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simple client-side check (for basic protection)
    // The real password is set as an env var
    const correctPassword = process.env.NEXT_PUBLIC_PORTAL_PASSWORD || 'jarvis2026';

    if (password === correctPassword) {
      // Set auth flag + cookie via API
      fetch('/api/portal-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
        .then((res) => {
          if (res.ok) {
            router.push('/dashboard');
          } else {
            setError('Authentication failed. Please try again.');
            setLoading(false);
          }
        })
        .catch(() => {
          setError('Network error. Please try again.');
          setLoading(false);
        });
    } else {
      setError('Incorrect password. Try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <div className="mb-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 text-sm font-bold text-slate-950 mb-4">
              J
            </div>
            <h1 className="text-2xl font-bold text-white">JARVIS PRIME</h1>
            <p className="mt-2 text-sm text-gray-400">Operations Portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Portal Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-3 font-semibold text-slate-950 transition-all hover:shadow-lg hover:shadow-cyan-400/30 disabled:opacity-60"
            >
              {loading ? 'Unlocking...' : 'Access Portal'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-500">
            Only authorized team members can access this portal.
          </p>
        </div>
      </div>
    </div>
  );
}
