import type { MutableRefObject } from 'react';

type SessionRefs = {
  accessToken: MutableRefObject<string | null>;
  refreshPromise: MutableRefObject<Promise<string> | null>;
  clear: (showLogin?: boolean) => void;
};

export function ownerEndpoint(path: string) {
  const apiUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
  if (!apiUrl) throw new Error('Owner Workspace API endpoint is not configured.');
  return `${apiUrl}${path}`;
}

export async function refreshOwnerAccessToken(refs: SessionRefs) {
  if (refs.refreshPromise.current) return refs.refreshPromise.current;
  const refresh = (async () => {
    try {
      const response = await fetch(ownerEndpoint('/api/auth/refresh'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.accessToken) throw new Error(body.error?.message || 'Please sign in to continue.');
      refs.accessToken.current = body.accessToken;
      return body.accessToken as string;
    } catch (error) {
      refs.clear();
      throw error;
    } finally {
      refs.refreshPromise.current = null;
    }
  })();
  refs.refreshPromise.current = refresh;
  return refresh;
}

export async function ownerRequest<T>(path: string, init: RequestInit, refs: SessionRefs): Promise<T> {
  let token = refs.accessToken.current || await refreshOwnerAccessToken(refs);
  const send = () => fetch(ownerEndpoint(path), { ...init, credentials: 'include', headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  let response = await send();
  if (response.status === 401) { token = await refreshOwnerAccessToken(refs); response = await send(); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) refs.clear();
    throw new Error(body.error?.message || 'Owner Workspace request failed.');
  }
  return body as T;
}
