'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePortalSession } from '../components/PortalSessionBoundary';
import ClientSignIn from './components/ClientSignIn';
import ClientWorkspace from './components/ClientWorkspace';

type Snapshot = {
  client: { id: string; name: string };
  projects: { id: string; name: string }[];
  tasks: { id: string; project_id: string; name: string; completed: boolean }[];
  documents: { id: string; project_id: string | null; title: string; document_type: string; created_at: string }[];
};
type ApiBody<T> = { success: true; data: T };

export default function ClientPage() {
  const {
    credentials, setCredentials, needsLogin, loading: authenticationLoading, error, setError, request, login, logout,
  } = usePortalSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    setSnapshot(null);
    try {
      const body = await request<ApiBody<Snapshot>>('/api/client-portal');
      setSnapshot(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the Client Portal.');
    } finally {
      setLoading(false);
    }
  }, [request, setError]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);
  useEffect(() => { if (needsLogin) setSnapshot(null); }, [needsLogin]);

  async function signInAndLoad() {
    try {
      await login();
      await loadSnapshot();
    } catch {
      // The shared session boundary exposes the authentication error to the sign-in view.
    }
  }

  async function signOut() {
    await logout();
    setSnapshot(null);
    setLoading(false);
  }

  async function downloadDocument(documentId: string) {
    try {
      const body = await request<ApiBody<{ url: string }>>(`/api/client-portal/documents/${documentId}/download`);
      window.location.assign(body.data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Document download failed.');
    }
  }

  if (needsLogin) {
    return <ClientSignIn credentials={credentials} error={error} loading={authenticationLoading || loading} onChange={setCredentials} onSubmit={() => void signInAndLoad()} />;
  }
  return <ClientWorkspace snapshot={snapshot} loading={loading} error={error} onRefresh={() => void loadSnapshot()} onLogout={() => void signOut()} onDocumentDownload={downloadDocument} />;
}
