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

    // Password check (default: jarvis2026)
    const correctPassword = process.env.NEXT_PUBLIC_PORTAL_PASSWORD || 'jarvis2026';

    if (password === correctPassword) {
      // Store auth in localStorage AND cookie
      localStorage.setItem('portal_authenticated', 'true');
      document.cookie = 'portal_authenticated=true; path=/; max-age=604800'; // 7 days
      
      // Redirect after a brief delay to ensure cookie is set
      setTimeout(() => {
        router.push('/dashboard');
      }, 300);
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
                disabled={loading}
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
