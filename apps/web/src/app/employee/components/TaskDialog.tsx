'use client';

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type Props = {
  task: { id: string; name: string; completed: boolean };
  onClose: () => void;
  onConfirm: (justification: string) => Promise<void>;
};

export default function TaskDialog({ task, onClose, onConfirm }: Props) {
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const action = task.completed ? 'Reopen' : 'Complete';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!justification.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(justification.trim());
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !submitting) return onClose();
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('textarea:not(:disabled), button:not(:disabled)');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <div
    className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
    onKeyDown={handleKeyDown}
  >
    <form
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-dialog-title"
      onSubmit={submit}
      className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
    >
      <p className="text-sm font-medium text-cyan-400">Task update</p>
      <h2 id="task-dialog-title" className="mt-1 text-xl font-semibold">{action} task</h2>
      <p className="mt-2 text-sm text-slate-400">{task.name}</p>
      <label className="mt-6 block text-sm font-medium">
        {task.completed ? 'Why are you reopening this task?' : 'Completion justification'}
        <textarea
          autoFocus
          required
          maxLength={1000}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25"
          placeholder="Add the required note…"
        />
      </label>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          Cancel
        </button>
        <button
          disabled={submitting || !justification.trim()}
          className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : `${action} task`}
        </button>
      </div>
    </form>
  </div>;
}
