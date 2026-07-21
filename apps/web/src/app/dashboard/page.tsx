'use client';

import OwnerDashboardPanels from './components/OwnerDashboardPanels';
import { useOwnerWorkspace } from './components/OwnerSessionBoundary';

export default function DashboardPage() {
  const { dashboard, loading, error, refresh } = useOwnerWorkspace();
  return <section>
    <header className="mb-7"><p className="text-sm font-medium text-cyan-300">Overview</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Owner workspace</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">A source-backed summary of current operations. Unavailable sources are never shown as zero.</p></header>
    <OwnerDashboardPanels dashboard={dashboard} loading={loading} error={error} onRetry={refresh} />
  </section>;
}
