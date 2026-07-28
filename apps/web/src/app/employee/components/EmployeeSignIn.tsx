'use client';
/* eslint-disable @next/next/no-img-element */

type Props = {
  credentials: { email: string; password: string };
  error: string;
  loading: boolean;
  onChange: (credentials: { email: string; password: string }) => void;
  onSubmit: () => void;
};

export default function EmployeeSignIn({
  credentials,
  error,
  loading,
  onChange,
  onSubmit,
}: Props) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-8 text-slate-100">
    <section className="w-full max-w-md rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/30 sm:p-8">
      <div className="mb-8">
        <img src="/logo-white.svg" alt="JARVIS PRIME" className="h-8 w-auto" />
        <p className="mt-7 text-sm font-medium text-cyan-400">Employee Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to view your assigned work.</p>
      </div>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
            type="email"
            autoComplete="email"
            required
            value={credentials.email}
            onChange={(event) => onChange({ ...credentials, email: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
            type="password"
            autoComplete="current-password"
            required
            value={credentials.password}
            onChange={(event) => onChange({ ...credentials, password: event.target.value })}
          />
        </label>
        <button
          className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  </main>;
}
