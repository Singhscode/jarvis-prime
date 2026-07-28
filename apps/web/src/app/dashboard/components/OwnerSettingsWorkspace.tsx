'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOwnerWorkspace } from './OwnerSessionBoundary';
import type { ApiBody, OwnerSettingStatus, OwnerSettingsStatus } from '../lib/owner-contracts';

export default function OwnerSettingsWorkspace() {
  const { request } = useOwnerWorkspace(); const [settings, setSettings] = useState<OwnerSettingsStatus | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const body = await request<ApiBody<OwnerSettingsStatus>>('/api/owner-workspace/settings/status'); setSettings(body.data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load settings status.'); } finally { setLoading(false); } }, [request]);
  useEffect(() => { void load(); }, [load]);
  const cards: OwnerSettingStatus[] = settings ? [settings.api, settings.environment, settings.companyProfile, settings.branding, settings.integrations, settings.editableSettings] : [];
  return <section><header className="mb-7"><p className="text-sm text-cyan-300">Settings</p><h1 className="text-3xl font-semibold">Workspace status inventory</h1><p className="mt-2 text-sm text-slate-300">Read-only source status. Roles, permissions, secrets, authentication, and environment configuration cannot be changed here.</p></header>{error && <p role="alert" className="rounded border border-red-400/30 p-3">{error}<button onClick={() => void load()} className="ml-3 underline">Try again</button></p>}<section aria-busy={loading} className="grid gap-4 md:grid-cols-2">{loading ? Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-900" />) : cards.map((item) => <article key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="font-semibold">{item.label}</h2><p className="mt-3 text-lg">{item.status === 'available' ? item.value : 'Unavailable'}</p><p className="mt-2 text-sm text-slate-400">{item.reason || `Source: ${item.source}`}</p></article>)}</section></section>;
}
