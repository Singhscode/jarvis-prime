'use client';

import { useState } from 'react';
import TaskDialog from './TaskDialog';

type Task = { id: string; project_id: string; name: string; completed: boolean };
type Props = {
  tasks: Task[];
  projects: { id: string; name: string }[];
  onTaskChange: (task: Task, justification: string) => Promise<void>;
};

export default function TaskList({ tasks, projects, onTaskChange }: Props) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const openTaskCount = tasks.filter((task) => !task.completed).length;

  return <section
    id="tasks"
    className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5"
  >
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-cyan-400">Priority work</p>
        <h2 className="mt-1 text-xl font-semibold">Assigned tasks</h2>
      </div>
      <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm font-medium text-cyan-300">
        {openTaskCount} open
      </span>
    </div>
    {!tasks.length ? <div className="mt-6 rounded-xl border border-dashed border-[var(--workspace-border)] px-4 py-10 text-center">
      <p className="font-medium">You’re all caught up.</p>
      <p className="mt-1 text-sm text-[var(--workspace-muted)]">No assigned tasks right now.</p>
    </div> : <ul className="mt-5 divide-y divide-[var(--workspace-border)]">
      {tasks.map((task) => <li className="flex items-center gap-3 py-4" key={task.id}>
        <button
          role="checkbox"
          aria-checked={task.completed}
          aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.name}`}
          onClick={() => setSelectedTask(task)}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 ${task.completed ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-[var(--workspace-border)] hover:border-cyan-400'}`}
        >
          {task.completed ? '✓' : ''}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${task.completed ? 'text-[var(--workspace-muted)] line-through' : ''}`}>{task.name}</p>
          <p className="mt-1 truncate text-sm text-[var(--workspace-muted)]">{projectNames.get(task.project_id) || 'Project unavailable'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.completed ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
          {task.completed ? 'Completed' : 'Open'}
        </span>
      </li>)}
    </ul>}
    {selectedTask && <TaskDialog
      task={selectedTask}
      onClose={() => setSelectedTask(null)}
      onConfirm={async (justification) => {
        await onTaskChange(selectedTask, justification);
        setSelectedTask(null);
      }}
    />}
  </section>;
}
