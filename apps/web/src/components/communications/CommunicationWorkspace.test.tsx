import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommunicationWorkspace, { type CommunicationRequest } from './CommunicationWorkspace';

const createdAt = '2026-08-26T12:00:00.000Z';
const participant = { userId: 'employee-1', kind: 'employee', displayName: 'Mina Employee' };
const inboxThread = { id: 'thread-1', subject: 'Delivery plan', latestSequence: 2, latestMessageAt: createdAt, unreadCount: 1, preview: 'Second message', participants: [participant] };
const sentThread = { ...inboxThread, id: 'thread-2', subject: 'Sent update', unreadCount: 0 };
const attachment = { id: 'attachment-1', filename: 'report.pdf', mediaType: 'application/pdf', sizeBytes: 42, createdAt };
const detail = {
  thread: { ...inboxThread },
  messages: [
    { id: 'message-2', sequence: 2, body: 'Second message', createdAt, sender: { kind: 'owner', displayName: 'Owner' }, attachments: [attachment] },
    { id: 'message-1', sequence: 1, body: 'First message', createdAt, sender: { kind: 'employee', displayName: 'Mina Employee' }, attachments: [] },
  ],
  pageInfo: { nextBeforeSequence: null, hasNextPage: false },
};
const notification = { id: 'notification-1', kind: 'message', state: 'unread', threadId: inboxThread.id, messageId: 'message-2', title: 'Reply required', createdAt, readAt: null, dismissedAt: null };
const success = <T,>(data: T) => ({ success: true as const, data });
const nativeCrypto = globalThis.crypto;
type RequestMock = { mock: { calls: Array<[string, RequestInit?]> } };

function callsFor(request: CommunicationRequest) {
  return (request as unknown as RequestMock).mock.calls;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: nativeCrypto });
});

function requestForWorkspace() {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/communications/threads?')) {
      const view = new URL(path, 'http://test').searchParams.get('view');
      return success({ items: view === 'sent' ? [sentThread] : [inboxThread], pageInfo: { nextCursor: null, hasNextPage: false } });
    }
    if (path === '/api/communications/notifications?limit=20') return success({ items: [notification], pageInfo: { nextCursor: null, hasNextPage: false } });
    if (path === '/api/communications/preferences') return success({ inAppEnabled: true, emailEnabled: false });
    if (path === '/api/communications/threads/thread-1?limit=50') return success(detail);
    if (path.endsWith('/read')) return success({});
    if (path.endsWith('/messages') && init?.method === 'POST') return success({ message: { id: 'message-3' } });
    if (path.endsWith('/attachments/attachment-1/download')) return success({ url: 'https://storage.test/signed-report' });
    if (path.endsWith('/notifications/notification-1') && init?.method === 'PATCH') {
      const state = JSON.parse(String(init.body)).state;
      return success({ state, readAt: state === 'read' ? createdAt : createdAt, dismissedAt: state === 'dismissed' ? createdAt : null });
    }
    if (path === '/api/communications/preferences' && init?.method === 'PUT') return success({});
    if (path === '/api/communications/threads' && init?.method === 'POST') return success(detail);
    throw new Error(`Unexpected request: ${path}`);
  }) as unknown as CommunicationRequest;
}

function renderWorkspace(request = requestForWorkspace(), role: 'owner' | 'employee' | 'client' = 'owner') {
  return { request, ...render(<CommunicationWorkspace request={request} role={role} heading="Communications" description="Scoped communication." />) };
}

describe('CommunicationWorkspace', () => {
  it('shows creation controls only to owners and keeps client and employee participants reply-only', async () => {
    const owner = renderWorkspace();
    await screen.findByText('Delivery plan');
    expect(screen.getByRole('button', { name: 'New thread' })).toBeTruthy();
    owner.unmount();

    renderWorkspace(requestForWorkspace(), 'employee');
    await screen.findByText('Delivery plan');
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull();
    cleanup();

    renderWorkspace(requestForWorkspace(), 'client');
    await screen.findByText('Delivery plan');
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull();
  });

  it('submits only typed business codes when an owner creates a thread', async () => {
    const user = userEvent.setup();
    const { request } = renderWorkspace();
    await screen.findByText('Delivery plan');
    await user.click(screen.getByRole('button', { name: 'New thread' }));
    expect(screen.getByLabelText('Employee code')).toBeTruthy();
    expect(screen.getByLabelText('Client code')).toBeTruthy();
    expect(screen.queryByLabelText('Employee user ID')).toBeNull();
    expect(screen.queryByLabelText('Client membership ID')).toBeNull();
    await user.type(screen.getByLabelText('Thread subject'), 'Project update');
    await user.type(screen.getByLabelText('Initial message'), 'Initial update');
    await user.type(screen.getByLabelText('Employee code'), 'JP-EMP-000001');
    await user.type(screen.getByLabelText('Client code'), 'JP-CLI-000005');
    await user.click(screen.getByRole('button', { name: 'Create thread' }));
    await waitFor(() => {
      const create = callsFor(request).find(([path, init]) => path === '/api/communications/threads' && init?.method === 'POST');
      expect(create).toBeTruthy();
      expect(JSON.parse(String(create?.[1]?.body))).toEqual({
        subject: 'Project update', body: 'Initial update', participants: [
          { kind: 'employee', employeeCode: 'JP-EMP-000001' }, { kind: 'client', clientCode: 'JP-CLI-000005' },
        ],
      });
      expect(String(create?.[1]?.body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    });
  });

  it('filters inbox and sent threads, orders immutable messages, marks reads, and sends with an idempotency key', async () => {
    const user = userEvent.setup();
    const { request } = renderWorkspace();
    await screen.findByText('Delivery plan');
    await user.click(screen.getByRole('button', { name: /Delivery plan/ }));
    expect(await screen.findByText('First message')).toBeTruthy();
    const first = screen.getByText('First message').closest('article');
    const second = screen.getAllByText('Second message').find((element) => element.closest('article'))?.closest('article');
    expect((first?.compareDocumentPosition(second as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(callsFor(request).some(([path, init]) => path.endsWith('/read') && init?.method === 'PUT')).toBe(true);

    await user.type(screen.getByLabelText('Message'), 'Acknowledged');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => {
      const sent = callsFor(request).find(([path, init]) => path.endsWith('/messages') && init?.method === 'POST');
      expect(sent).toBeTruthy();
      expect(new Headers(sent?.[1]?.headers).get('Idempotency-Key')).toBeTruthy();
    });

    await user.click(screen.getByRole('tab', { name: 'Sent' }));
    expect(await screen.findByText('Sent update')).toBeTruthy();
    expect(callsFor(request).some(([path]) => path.includes('view=sent'))).toBe(true);
  });

  it('downloads attachments only through the authenticated request helper', async () => {
    const user = userEvent.setup();
    let assignedUrl = '';
    Object.defineProperty(window, 'location', { value: { ...window.location, assign: (url: string) => { assignedUrl = url; } }, writable: true });
    const { request } = renderWorkspace();
    await user.click(await screen.findByRole('button', { name: /Delivery plan/ }));
    await user.click(await screen.findByRole('button', { name: /report\.pdf/ }));
    await waitFor(() => expect(assignedUrl).toBe('https://storage.test/signed-report'));
    expect(callsFor(request).some(([path]) => path.endsWith('/attachments/attachment-1/download'))).toBe(true);
  });

  it('updates notifications and preferences, and offers accessible error recovery', async () => {
    const user = userEvent.setup();
    const { request } = renderWorkspace();
    await screen.findByText('Reply required');
    await user.click(screen.getByRole('button', { name: 'Reply required' }));
    await waitFor(() => {
      const read = callsFor(request).find(([path, init]) => path.endsWith('/notifications/notification-1')
        && init?.method === 'PATCH' && JSON.parse(String(init.body)).state === 'read');
      expect(read).toBeTruthy();
      expect(screen.getByText('0 unread')).toBeTruthy();
    });
    await user.click(screen.getByLabelText('Email notifications'));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('Reply required')).toBeNull());
    const calls = callsFor(request);
    expect(calls.some(([path, init]) => path === '/api/communications/preferences' && init?.method === 'PUT')).toBe(true);
    expect(calls.some(([path, init]) => path.endsWith('/notifications/notification-1') && init?.method === 'PATCH')).toBe(true);

    cleanup();
    let unavailable = true;
    const availableRequest = requestForWorkspace();
    const retryRequest = vi.fn(async (path: string, init?: RequestInit) => {
      if (unavailable) throw new Error('Communications are temporarily unavailable.');
      return availableRequest(path, init);
    }) as unknown as CommunicationRequest;
    renderWorkspace(retryRequest, 'employee');
    expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable');
    unavailable = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Delivery plan')).toBeTruthy();
  });

  it('preserves earlier thread pages while loading the next cursor', async () => {
    const user = userEvent.setup();
    const pageTwo = { ...sentThread, id: 'thread-3', subject: 'Older conversation' };
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/api/communications/threads?')) {
        const cursor = new URL(path, 'http://test').searchParams.get('cursor');
        return cursor === 'cursor-2'
          ? success({ items: [pageTwo], pageInfo: { nextCursor: null, hasNextPage: false } })
          : success({ items: [inboxThread], pageInfo: { nextCursor: 'cursor-2', hasNextPage: true } });
      }
      if (path === '/api/communications/notifications?limit=20') return success({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } });
      if (path === '/api/communications/preferences') return success({ inAppEnabled: true, emailEnabled: false });
      throw new Error(`Unexpected request: ${path}`);
    }) as unknown as CommunicationRequest;
    renderWorkspace(request);
    await screen.findByText('Delivery plan');
    expect(callsFor(request).filter(([path]) => path.includes('/threads?') && !path.includes('cursor=')).length).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Load more conversations' }));
    expect(await screen.findByText('Older conversation')).toBeTruthy();
    expect(screen.getByText('Delivery plan')).toBeTruthy();
    expect(callsFor(request).some(([path]) => path.includes('cursor=cursor-2'))).toBe(true);
  });

  it('preserves older messages through polling and focus refreshes in sequence order', async () => {
    let latestLoads = 0;
    const newest = {
      ...detail,
      messages: detail.messages.map((message) => ({ ...message, attachments: [] })),
      pageInfo: { nextBeforeSequence: 2, hasNextPage: true },
    };
    const older = {
      ...detail,
      messages: [{ id: 'message-0', sequence: 1, body: 'Oldest message', createdAt, sender: { kind: 'client', displayName: 'Client' }, attachments: [] }],
      pageInfo: { nextBeforeSequence: null, hasNextPage: false },
    };
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/api/communications/threads?')) return success({ items: [inboxThread], pageInfo: { nextCursor: null, hasNextPage: false } });
      if (path === '/api/communications/notifications?limit=20') return success({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } });
      if (path === '/api/communications/preferences') return success({ inAppEnabled: true, emailEnabled: false });
      if (path.includes('beforeSequence=2')) return success(older);
      if (path === '/api/communications/threads/thread-1?limit=50') { latestLoads += 1; return success(newest); }
      if (path.endsWith('/read') && init?.method === 'PUT') return success({});
      throw new Error(`Unexpected request: ${path}`);
    }) as unknown as CommunicationRequest;
    const user = userEvent.setup();
    renderWorkspace(request);
    await screen.findByText('Delivery plan');
    await user.click(screen.getByRole('button', { name: /Delivery plan/ }));
    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('Oldest message')).toBeTruthy();

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(latestLoads).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('Oldest message')).toBeTruthy();
    const articles = screen.getAllByRole('article');
    expect(articles.map((article) => article.textContent).join('|')).toMatch(/Oldest message.*Second message/);
  });

  it('polls only while visible, refreshes on focus, and never writes portal data to browser storage', async () => {
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const { request } = renderWorkspace();
    await screen.findByText('Delivery plan');
    const initialCalls = callsFor(request).length;
    hidden.mockReturnValue(true);
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(callsFor(request)).toHaveLength(initialCalls);
    hidden.mockReturnValue(false);
    vi.useRealTimers();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(callsFor(request).length).toBeGreaterThan(initialCalls));
    expect(persist).not.toHaveBeenCalled();
  });
});
