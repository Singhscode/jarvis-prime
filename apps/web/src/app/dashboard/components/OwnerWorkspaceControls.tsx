'use client';

type Props = { loading: boolean; onRefresh: () => void; onLogout: () => void };

export default function OwnerWorkspaceControls({ loading, onRefresh, onLogout }: Props) {
  return <div className="flex items-center gap-2">
    <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
    <button onClick={onLogout} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">Log out</button>
  </div>;
}
