'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerDocument } from '../lib/owner-contracts';

export default function OwnerDocumentDetail({ documentId }: { documentId: string }) {
  const { request } = useOwnerWorkspace(); const [document, setDocument] = useState<OwnerDocument | null>(null); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const body = await request<ApiBody<OwnerDocument>>(`/api/owner-workspace/documents/${documentId}`); setDocument(body.data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load document.'); } finally { setLoading(false); } }, [documentId, request]);
  useEffect(() => { void load(); }, [load]);
  async function revoke() { setWorking(true); setError(''); try { const body = await request<ApiBody<OwnerDocument>>(`/api/owner-workspace/documents/${documentId}`, { method: 'DELETE' }); setDocument(body.data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to revoke document.'); } finally { setWorking(false); } }
  if (loading) return <section aria-busy="true" className="space-y-4"><div className="h-10 w-64 animate-pulse rounded bg-slate-800" /><div className="h-48 animate-pulse rounded-2xl bg-slate-900" /></section>;
  if (error && !document) return <section role="alert"><h1 className="text-xl font-semibold">Document could not load</h1><p>{error}</p><button onClick={() => void load()} className="mt-3 underline">Try again</button></section>;
  return <section><Link href="/dashboard/documents" className="text-sm text-cyan-300 hover:underline">← Documents</Link><header className="mt-4"><p className="text-sm text-cyan-300">Document details</p><h1 className="text-3xl font-semibold">{document?.title}</h1></header>{error && <p role="alert" className="mt-4 rounded border border-red-400/30 p-3">{error}</p>}<dl className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:grid-cols-2"><div><dt className="text-sm text-slate-400">Visibility</dt><dd>{document?.visibility}</dd></div><div><dt className="text-sm text-slate-400">Type</dt><dd>{document?.documentType}</dd></div><div><dt className="text-sm text-slate-400">Client</dt><dd>{document?.client?.name || 'Unavailable'}</dd></div><div><dt className="text-sm text-slate-400">Project</dt><dd>{document?.project?.name || 'No project association'}</dd></div></dl><p className="mt-4 text-sm text-slate-400">Private file paths, download URLs, versions, and file editing are unavailable in this workspace.</p>{document?.visibility === 'visible' && <button disabled={working} onClick={() => void revoke()} className="mt-5 rounded border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60">Revoke client visibility</button>}</section>;
}
