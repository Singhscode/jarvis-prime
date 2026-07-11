'use client';

/**
 * Portal login page.
 *
 * Security model:
 * - The password is NEVER stored in the client bundle.
 *   It lives only in PORTAL_PASSWORD (a server-only env var, no NEXT_PUBLIC_ prefix).
 * - This page submits the password to POST /api/portal-auth.
 *   The server does the comparison and, on success, sets an HttpOnly HMAC-signed cookie.
 * - The middleware verifies that cookie's signature on every protected request.
 *   A forged / manually-set cookie is rejected immediately.
 */

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function PortalAuth() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/portal-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // credentials: 'same-origin' ensures the HttpOnly cookie is accepted
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Cookie is now set server-side (HttpOnly, Secure, SameSite=Strict).
        // No localStorage, no client-readable cookie — nothing to steal from JS.
        router.push('/dashboard');
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setError('Too many attempts. Please wait 15 minutes and try again.');
      } else if (res.status === 503) {
        setError('Portal is not configured. Contact the administrator.');
      } else {
        setError(data.error ?? 'Incorrect password. Try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

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
              <label
                htmlFor="portal-password"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Portal Password
              </label>
              <input
                id="portal-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50"
                autoFocus
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-3 font-semibold text-slate-950 transition-all hover:shadow-lg hover:shadow-cyan-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying…' : 'Access Portal'}
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
