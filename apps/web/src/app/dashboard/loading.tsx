export default function DashboardLoading() {
  return <main aria-busy="true" className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="h-9 w-56 rounded bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-slate-900" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><div className="h-64 rounded-2xl bg-slate-900" /><div className="h-64 rounded-2xl bg-slate-900" /></div>
    </div>
  </main>;
}
