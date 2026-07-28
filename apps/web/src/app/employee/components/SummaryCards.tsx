type Props = { projects: number; openTasks: number; completedTasks: number; clients: number; leads: number };

export default function SummaryCards({ projects, openTasks, completedTasks, clients, leads }: Props) {
  const cards = [['Projects', projects], ['Open tasks', openTasks], ['Completed', completedTasks], ['Clients', clients], ['Leads', leads]];
  return <section aria-label="Workspace summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
    {cards.map(([label, value]) => <div className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4" key={label as string}><p className="text-sm text-[var(--workspace-muted)]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p></div>)}
  </section>;
}