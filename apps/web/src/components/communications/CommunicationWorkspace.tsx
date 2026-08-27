'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CommunicationRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type ApiBody<T> = { success: true; data: T };
type Participant = { userId: string; kind: 'owner' | 'employee' | 'client'; displayName: string };
type Thread = { id: string; subject: string; latestSequence: number; latestMessageAt: string; unreadCount: number; preview: string; participants: Participant[] };
type Attachment = { id: string; filename: string; mediaType: string; sizeBytes: number; createdAt: string };
type Message = { id: string; sequence: number; body: string; createdAt: string; sender: { kind: string; displayName: string }; attachments: Attachment[] };
type ThreadDetail = { thread: Omit<Thread, 'preview'>; messages: Message[]; pageInfo: { nextBeforeSequence: number | null; hasNextPage: boolean } };
type Notification = { id: string; kind: string; state: 'unread' | 'read' | 'dismissed'; threadId: string; messageId: string; title: string; createdAt: string; readAt: string | null; dismissedAt: string | null };
type Preferences = { inAppEnabled: boolean; emailEnabled: boolean };
type ThreadList = { items: Thread[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean } };
type NotificationList = { items: Notification[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean } };

type Props = { request: CommunicationRequest; role: 'owner' | 'employee' | 'client'; heading: string; description: string };
const POLL_INTERVAL_MS = 15_000;

async function api<T>(request: CommunicationRequest, path: string, init?: RequestInit) {
  return (await request<ApiBody<T>>(path, init)).data;
}
function requestKey() { return globalThis.crypto?.randomUUID?.() || `communication-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, { ...merged.get(item.id), ...item });
  return [...merged.values()];
}
function mergeMessages(current: Message[], incoming: Message[]) {
  return [...new Map([...current, ...incoming].map((message) => [message.id, message])).values()].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
}
function dateLabel(value: string) { return new Date(value).toLocaleString(); }

export default function CommunicationWorkspace({ request, role, heading, description }: Props) {
  const [view, setView] = useState<'inbox' | 'sent'>('inbox');
  const [threads, setThreads] = useState<Thread[]>([]); const [threadPage, setThreadPage] = useState<ThreadList['pageInfo']>({ nextCursor: null, hasNextPage: false });
  const [selectedId, setSelectedId] = useState<string | null>(null); const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]); const [preferences, setPreferences] = useState<Preferences>({ inAppEnabled: true, emailEnabled: false });
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const [body, setBody] = useState(''); const [files, setFiles] = useState<File[]>([]); const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false); const [subject, setSubject] = useState(''); const [employeeCode, setEmployeeCode] = useState(''); const [clientCode, setClientCode] = useState('');
  const selectedRef = useRef<string | null>(null);
  const summaryViewRef = useRef<'inbox' | 'sent' | null>(null);

  const loadDetail = useCallback(async (threadId: string, beforeSequence?: number, mode: 'replace' | 'appendOlder' | 'mergeLatest' = 'replace') => {
    const suffix = beforeSequence ? `?beforeSequence=${beforeSequence}&limit=50` : '?limit=50';
    const incoming = await api<ThreadDetail>(request, `/api/communications/threads/${threadId}${suffix}`);
    setDetail((current) => {
      if (!current || current.thread.id !== incoming.thread.id || mode === 'replace') {
        return { ...incoming, messages: mergeMessages([], incoming.messages) };
      }
      return {
        ...incoming,
        messages: mergeMessages(current.messages, incoming.messages),
        pageInfo: mode === 'appendOlder' ? incoming.pageInfo : current.pageInfo,
      };
    });
    return incoming;
  }, [request]);

  const loadSummary = useCallback(async (cursor: string | null = null, append = false) => {
    const suffix = new URLSearchParams({ view, limit: '20', ...(cursor ? { cursor } : {}) }).toString();
    const [threadData, notificationData, preferenceData] = await Promise.all([
      api<ThreadList>(request, `/api/communications/threads?${suffix}`),
      api<NotificationList>(request, '/api/communications/notifications?limit=20'),
      api<Preferences>(request, '/api/communications/preferences'),
    ]);
    const sameView = summaryViewRef.current === view;
    setThreads((current) => sameView || append ? mergeById(current, threadData.items) : threadData.items);
    setThreadPage((current) => append || !sameView ? threadData.pageInfo : current);
    summaryViewRef.current = view;
    setNotifications((current) => mergeById(current, notificationData.items)); setPreferences(preferenceData);
    return threadData;
  }, [request, view]);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      await loadSummary();
      if (selectedRef.current) await loadDetail(selectedRef.current, undefined, 'mergeLatest');
      setStatus('Communication Hub is up to date.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Communication Hub.');
    } finally { if (showLoading) setLoading(false); }
  }, [loadDetail, loadSummary]);

  useEffect(() => {
    summaryViewRef.current = null; selectedRef.current = null;
    setThreads([]); setThreadPage({ nextCursor: null, hasNextPage: false }); setSelectedId(null); setDetail(null);
  }, [view]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const refreshIfVisible = () => { if (!document.hidden) void refresh(false); };
    const interval = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible); document.addEventListener('visibilitychange', refreshIfVisible);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshIfVisible); document.removeEventListener('visibilitychange', refreshIfVisible); };
  }, [refresh]);

  async function openThread(threadId: string) {
    setSelectedId(threadId); selectedRef.current = threadId; setError('');
    try {
      const opened = await loadDetail(threadId);
      if (opened.thread.latestSequence > 0) await api(request, `/api/communications/threads/${threadId}/read`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequence: opened.thread.latestSequence }) });
      await loadSummary();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open this thread.');
      return false;
    }
  }

  async function loadOlder() {
    if (!detail?.pageInfo.nextBeforeSequence) return;
    setLoadingMore(true);
    try { await loadDetail(detail.thread.id, detail.pageInfo.nextBeforeSequence, 'appendOlder'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load older messages.'); }
    finally { setLoadingMore(false); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!selectedId || !body.trim()) return;
    setSending(true); setError('');
    try {
      const key = requestKey(); let init: RequestInit;
      if (files.length) {
        const form = new FormData(); form.append('body', body.trim()); files.forEach((file) => form.append('attachments', file, file.name));
        init = { method: 'POST', headers: { 'Idempotency-Key': key }, body: form };
      } else init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ body: body.trim() }) };
      await api(request, `/api/communications/threads/${selectedId}/messages`, init);
      setBody(''); setFiles([]); await loadDetail(selectedId, undefined, 'mergeLatest'); await loadSummary(); setStatus('Message sent.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send message.'); }
    finally { setSending(false); }
  }

  async function createThread(event: React.FormEvent) {
    event.preventDefault();
    const participants = [
      ...(employeeCode.trim() ? [{ kind: 'employee', employeeCode: employeeCode.trim() }] : []),
      ...(clientCode.trim() ? [{ kind: 'client', clientCode: clientCode.trim() }] : []),
    ];
    if (!subject.trim() || !body.trim() || !participants.length) { setError('A subject, initial message, and at least one participant locator are required.'); return; }
    setSending(true); setError('');
    try {
      const created = await api<{ thread: ThreadDetail['thread'] }>(request, '/api/communications/threads', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey() },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), participants }),
      });
      setCreating(false); setSubject(''); setEmployeeCode(''); setClientCode(''); setBody('');
      await loadSummary(); await openThread(created.thread.id); setStatus('Thread created.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create thread.'); }
    finally { setSending(false); }
  }

  async function updatePreferences(next: Preferences) {
    setPreferences(next); setError('');
    try { await api(request, '/api/communications/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }); setStatus('Notification preferences saved.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save preferences.'); await refresh(false); }
  }

  async function openNotification(notification: Notification) {
    if (!(await openThread(notification.threadId))) return;
    try {
      const updated = await api<{ state: 'read'; readAt: string | null }>(request, `/api/communications/notifications/${notification.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'read' }),
      });
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, state: updated.state, readAt: updated.readAt } : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update notification.'); }
  }

  async function dismiss(notificationId: string) {
    try { await api(request, `/api/communications/notifications/${notificationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'dismissed' }) }); setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, state: 'dismissed' } : item)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update notification.'); }
  }

  async function downloadAttachment(threadId: string, attachment: Attachment) {
    try {
      const download = await api<{ url: string }>(request, `/api/communications/threads/${threadId}/attachments/${attachment.id}/download`);
      window.location.assign(download.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to download attachment.'); }
  }

  const selectedThread = useMemo(() => threads.find((thread) => thread.id === selectedId) || null, [selectedId, threads]);
  const unreadNotifications = notifications.filter((item) => item.state === 'unread');
  return <main className="min-h-screen bg-slate-950 px-4 py-7 text-slate-100 sm:px-6" aria-busy={loading}>
    <div className="mx-auto max-w-7xl space-y-5"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-cyan-400">Communication Hub</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{heading}</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p></div><button onClick={() => void refresh()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400">Refresh</button></header>
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">{error} <button onClick={() => void refresh()} className="underline underline-offset-4">Try again</button></p>}
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      <section className="grid gap-4 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.7fr)_minmax(16rem,0.65fr)]"><aside className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Threads</h2>{role === 'owner' && <button onClick={() => setCreating((value) => !value)} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">New thread</button>}</div>{creating && <form className="mt-4 space-y-3 rounded-xl border border-cyan-400/30 bg-slate-950 p-3" onSubmit={createThread}><label className="block text-sm">Subject<input aria-label="Thread subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><label className="block text-sm">Initial message<textarea aria-label="Initial message" value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 min-h-20 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><label className="block text-sm">Employee code (optional)<input aria-label="Employee code" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><label className="block text-sm">Client code (optional)<input aria-label="Client code" value={clientCode} onChange={(event) => setClientCode(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2" /></label><button disabled={sending} className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">Create thread</button></form>}<div className="mt-4 flex rounded-lg bg-slate-950 p-1" role="tablist" aria-label="Thread view"><button role="tab" aria-selected={view === 'inbox'} onClick={() => setView('inbox')} className={`flex-1 rounded px-3 py-2 text-sm ${view === 'inbox' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Inbox</button><button role="tab" aria-selected={view === 'sent'} onClick={() => setView('sent')} className={`flex-1 rounded px-3 py-2 text-sm ${view === 'sent' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Sent</button></div><div className="mt-3 space-y-2">{loading && !threads.length && <p className="text-sm text-slate-400">Loading conversations…</p>}{!loading && !threads.length && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">No {view === 'inbox' ? 'inbox' : 'sent'} conversations yet.</p>}{threads.map((thread) => <button key={thread.id} onClick={() => void openThread(thread.id)} className={`w-full rounded-xl border p-3 text-left focus:outline-none focus:ring-2 focus:ring-cyan-400 ${thread.id === selectedId ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-950 hover:bg-slate-800'}`}><span className="flex justify-between gap-2"><strong className="truncate">{thread.subject}</strong>{thread.unreadCount > 0 && <span className="rounded-full bg-cyan-400 px-2 text-xs font-bold text-slate-950">{thread.unreadCount}</span>}</span><span className="mt-1 block truncate text-xs text-slate-400">{thread.participants.map((participant) => participant.displayName).join(', ')}</span><span className="mt-2 block truncate text-sm text-slate-300">{thread.preview}</span></button>)}{threadPage.hasNextPage && <button disabled={loadingMore} onClick={() => { setLoadingMore(true); void loadSummary(threadPage.nextCursor, true).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load conversations.')).finally(() => setLoadingMore(false)); }} className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">{loadingMore ? 'Loading…' : 'Load more conversations'}</button>}</div></aside>
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">{!selectedThread && <div className="grid min-h-80 place-items-center text-center"><div><h2 className="text-xl font-semibold">Select a conversation</h2><p className="mt-2 text-sm text-slate-400">Messages remain scoped to active participants only.</p></div></div>}{selectedThread && detail && <><header className="border-b border-slate-700 pb-4"><h2 className="text-xl font-semibold">{detail.thread.subject}</h2><p className="mt-1 text-sm text-slate-400">{detail.thread.participants.map((participant) => participant.displayName).join(' · ')}</p></header><div className="min-h-72 space-y-4 py-5">{detail.pageInfo.hasNextPage && <button disabled={loadingMore} onClick={() => void loadOlder()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">{loadingMore ? 'Loading…' : 'Load older messages'}</button>}{detail.messages.map((message) => <article key={message.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><div className="flex justify-between gap-3 text-sm"><strong>{message.sender.displayName}</strong><time className="text-slate-500">{dateLabel(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{message.body}</p>{message.attachments.length > 0 && <ul className="mt-3 space-y-1">{message.attachments.map((attachment) => <li key={attachment.id}><button type="button" className="text-sm text-cyan-300 underline" onClick={() => void downloadAttachment(detail.thread.id, attachment)}>{attachment.filename} ({attachment.mediaType})</button></li>)}</ul>}</article>)}</div><form className="border-t border-slate-700 pt-4" onSubmit={send}><label className="sr-only" htmlFor="communication-message">Message</label><textarea id="communication-message" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} placeholder="Write a plain-text message" className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:ring-2 focus:ring-cyan-400" /><label className="mt-3 block text-sm text-slate-300">Attachments (PDF, PNG, JPEG, or text; five max)<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm" /></label>{files.length > 0 && <p className="mt-2 text-xs text-slate-400">{files.map((file) => file.name).join(', ')}</p>}<button disabled={sending || !body.trim()} className="mt-3 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:opacity-60">{sending ? 'Sending…' : 'Send message'}</button></form></>}</section>
        <aside className="space-y-4"><section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><h2 className="text-lg font-semibold">Notifications</h2><p className="mt-1 text-sm text-slate-400">{unreadNotifications.length} unread</p><ul className="mt-3 space-y-2">{notifications.filter((item) => item.state !== 'dismissed').map((notification) => <li key={notification.id} className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"><button onClick={() => void openNotification(notification)} className="text-left font-medium text-cyan-300 underline">{notification.title}</button><p className="mt-1 text-xs text-slate-400">{dateLabel(notification.createdAt)}</p><button onClick={() => void dismiss(notification.id)} className="mt-2 text-xs text-slate-300 underline">Dismiss</button></li>)}{!notifications.filter((item) => item.state !== 'dismissed').length && <li className="text-sm text-slate-400">No notifications.</li>}</ul></section><section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><h2 className="text-lg font-semibold">Preferences</h2><label className="mt-3 flex items-center justify-between gap-3 text-sm">In-app notifications<input aria-label="In-app notifications" type="checkbox" checked={preferences.inAppEnabled} onChange={(event) => void updatePreferences({ ...preferences, inAppEnabled: event.target.checked })} /></label><label className="mt-3 flex items-center justify-between gap-3 text-sm">Email notifications<input aria-label="Email notifications" type="checkbox" checked={preferences.emailEnabled} onChange={(event) => void updatePreferences({ ...preferences, emailEnabled: event.target.checked })} /></label><p className="mt-3 text-xs text-slate-400">Email delivery is not enabled in this environment.</p></section></aside>
      </section></div>
  </main>;
}
