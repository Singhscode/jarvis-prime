'use client';

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
    <section role="alert" className="max-w-md rounded-2xl border border-red-400/30 bg-slate-900 p-6">
      <h1 className="text-xl font-semibold">Dashboard could not load</h1>
      <p className="mt-2 text-sm text-slate-300">Try again. If the problem continues, verify that the API service is available.</p>
      <button onClick={reset} className="mt-5 rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">Try again</button>
    </section>
  </main>;
}
