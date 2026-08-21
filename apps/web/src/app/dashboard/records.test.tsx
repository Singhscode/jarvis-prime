import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from './layout';
import OwnerCrmWorkspace from './components/OwnerCrmWorkspace';
import OwnerClientsWorkspace from './components/OwnerClientsWorkspace';
import ClientPortalAdministration from './components/ClientPortalAdministration';

process.env.NEXT_PUBLIC_ENGINE_URL = 'http://api.test';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asOf = '2026-07-21T12:00:00.000Z';
const bootstrap = { success: true, data: { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } } };
const dashboard = { success: true, data: { asOf, window: 'today', metrics: [], attention: { label: 'Attention', status: 'unavailable', source: 'owner_workspace', window: 'current', asOf, items: [], reason: 'Unavailable' }, recentActivity: { label: 'Activity', status: 'unavailable', source: 'owner_workspace', window: 'current', asOf, items: [], reason: 'Unavailable' }, health: { label: 'Health', status: 'unavailable', source: 'owner_workspace', window: 'current', asOf, reason: 'Unavailable' } } };
const company = { id: 'company-1', name: 'Acme', created_at: asOf, updated_at: asOf };
const contact = { id: 'contact-1', name: 'Ava', email: 'ava@example.test', phone: null, title: 'Director', company_id: null, client_id: 'client-1', created_at: asOf, updated_at: asOf };
const client = { id: 'client-1', name: 'Acme', created_at: asOf, updated_at: asOf };
const portal = { memberships: [{ id: 'membership-1', status: 'pending', created_at: asOf, updated_at: asOf, activated_at: null, revoked_at: null, contact: { id: contact.id, name: contact.name, email: contact.email, title: contact.title } }], pageInfo: { nextCursor: 'MQ', hasNextPage: true }, activity: { status: 'available', source: 'client_portal_memberships', asOf, items: [{ id: 'membership-1', label: 'Client Portal invitation pending', status: 'pending', timestamp: asOf }] } };
let nativeFetch = globalThis.fetch;

afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; vi.restoreAllMocks(); });
function ownerFetch() {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
    if (url.endsWith('/api/owner-workspace/dashboard')) return json(dashboard);
    if (url.includes('/crm/companies/company-1')) return json({ success: true, data: company });
    if (url.includes('/crm/companies')) return json({ success: true, data: { items: [company], pageInfo: { nextCursor: url.includes('cursor=MQ') ? null : 'MQ', hasNextPage: !url.includes('cursor=MQ') } } });
    if (url.includes('/clients/client-1/portal-invitations')) return json({ success: true, data: { membership: { id: 'membership-1', status: 'pending', expires_at: asOf } } });
    if (url.includes('/clients/client-1/portal-members/membership-1/resend')) return json({ success: true, data: { membership: { id: 'membership-1', status: 'pending', expires_at: asOf } } });
    if (url.includes('/clients/client-1/portal-members/membership-1') && init?.method === 'DELETE') return json({ success: true, data: {} });
    if (url.includes('/clients/client-1/portal')) return json({ success: true, data: portal });
    if (url.includes('/clients/client-1')) return json({ success: true, data: { client, contacts: { items: [contact], pageInfo: { nextCursor: null, hasNextPage: false } } } });
    return json({ error: { message: 'Unexpected test request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  return fetch;
}
function renderWorkspace(node: React.ReactNode) { return render(<DashboardLayout>{node}</DashboardLayout>); }

describe('Owner Workspace CRM and clients', () => {
  it('provides named CRM tabs, bounded search, pagination, and accessible record details', async () => {
    const user = userEvent.setup(); const fetch = ownerFetch();
    renderWorkspace(<OwnerCrmWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Companies, contacts, and leads' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Companies' }).getAttribute('aria-selected')).toBe('true');
    await user.type(screen.getByLabelText('Search Companies'), 'Acme'); await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(await screen.findByRole('button', { name: 'Next page' }));
    await user.click(await screen.findByRole('button', { name: 'View details' }));
    expect(await screen.findByText('updated at')).toBeTruthy();
    const urls = (fetch.mock.calls as unknown as Array<[RequestInfo | URL]>).map(([url]) => url.toString());
    expect(urls.some((url) => url.includes('/crm/companies?') && url.includes('q=Acme'))).toBe(true);
    expect(urls.some((url) => url.includes('cursor=MQ'))).toBe(true);
    expect(urls.every((url) => !url.includes('automation'))).toBe(true);
  });

  it('administers Client Portal invitations without exposing invitation material', async () => {
    const user = userEvent.setup(); const fetch = ownerFetch();
    renderWorkspace(<ClientPortalAdministration clientId="client-1" />);
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Client contact'), contact.id); await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect((await screen.findByRole('status')).textContent).toContain('Invitation sent.');
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('status')).textContent).toContain('Client Portal access revoked.');
    await user.click(screen.getByRole('button', { name: 'Next memberships' }));
    const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    await waitFor(() => expect(calls.some(([url]) => url.toString().includes('/portal?cursor=MQ'))).toBe(true));
    const invite = calls.find(([url]) => url.toString().includes('/portal-invitations'));
    expect(JSON.parse(invite?.[1]?.body as string)).toEqual({ contact_id: contact.id });
    expect(calls.some(([url]) => url.toString().includes('/resend'))).toBe(true);
    expect(calls.some(([url, init]) => url.toString().includes('/portal-members/membership-1') && init?.method === 'DELETE')).toBe(true);
    expect(document.body.textContent).not.toMatch(/token_hash|storage_path|raw-invitation/);
  });
});


  it('creates a Client account, sends only approved fields, refreshes the list, and highlights its generated Client ID', async () => {
    const user = userEvent.setup();
    const provisionedClient = { id: 'client-2', client_code: 'JP-CLI-000042', name: 'New Acme', created_at: asOf, updated_at: asOf };
    let created = false;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
      if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
      if (url.endsWith('/api/owner-workspace/dashboard')) return json(dashboard);
      if (url.includes('/api/owner-workspace/clients?')) return json({ success: true, data: { items: created ? [provisionedClient] : [], pageInfo: { nextCursor: null, hasNextPage: false } } });
      if (url.includes('/api/owner-workspace/client-accounts/email-eligibility?email=hello%40acme.test')) return json({ success: true, data: { eligibility: 'available' } });
      if (url.endsWith('/api/owner-workspace/clients/provision') && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toEqual({ name: 'New Acme', contact_name: 'Ava Client', email: 'hello@acme.test', phone: '+919876543210' });
        created = true;
        return json({ success: true, data: { client: { id: provisionedClient.id, clientCode: provisionedClient.client_code, name: provisionedClient.name }, delivery: { status: 'dry_run', expiresAt: asOf } } }, 201);
      }
      return json({ error: { message: 'Unexpected test request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;
    renderWorkspace(<OwnerClientsWorkspace />);
    await user.click(await screen.findByRole('button', { name: 'Create Client Account' }));
    await user.type(screen.getByLabelText('Client or Company Name'), 'New Acme');
    await user.type(screen.getByLabelText('Contact Name'), 'Ava Client');
    await user.type(screen.getByLabelText('Email'), 'hello@acme.test');
    await user.tab();
    expect((await screen.findByRole('status')).textContent).toBe('This email can receive a new invitation.');
    await user.type(screen.getByLabelText('Phone'), '+919876543210');
    await user.click(screen.getByRole('button', { name: 'Create and Send Invitation' }));
    expect((await screen.findByRole('status')).textContent).toBe('Client invitation sent. The client can activate their account from the email.');
    expect(await screen.findByText('New Acme')).toBeTruthy();
    expect(screen.getAllByText(/JP-CLI-000042/).length).toBeGreaterThanOrEqual(1);
    const provision = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(([url]) => url.toString().endsWith('/api/owner-workspace/clients/provision'));
    expect(Object.keys(JSON.parse(provision?.[1]?.body as string)).sort()).toEqual(['contact_name', 'email', 'name', 'phone']);
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.toString().includes('sort=created_at%3Adesc'))).toBe(true));
  });

it('opens the Client account dialog from the quick-action handoff', async () => {
  window.history.replaceState(null, '', '/dashboard/clients#new-client');
  ownerFetch(); renderWorkspace(<OwnerClientsWorkspace />);
  expect(await screen.findByRole('dialog', { name: 'Create Client Account' })).toBeTruthy();
  window.history.replaceState(null, '', '/dashboard/clients');
});

it('shows successful client deletion after returning to a freshly loaded client list', async () => {
  window.history.replaceState(null, '', '/dashboard/clients?clientDeleted=1');
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
    if (url.includes('/api/owner-workspace/clients?')) return json({ success: true, data: { items: [], pageInfo: { nextCursor: null, hasNextPage: false } } });
    return json({ error: { message: 'Unexpected test request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  renderWorkspace(<OwnerClientsWorkspace />);
  expect((await screen.findByRole('status')).textContent).toBe('Client account deleted successfully.');
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.toString().includes('/api/owner-workspace/clients?'))).toBe(true));
  expect(window.location.search).toBe('');
});


describe('Client contact creation for Client Portal invitations', () => {
  it('validates email, creates a client-scoped contact, refreshes the selector, and preserves invitation payloads', async () => {
    const user = userEvent.setup();
    const createdContact = { ...contact, id: 'contact-2', name: 'Nia', email: 'nia@example.test', phone: '+15555550100', title: 'Operations' };
    let created = false;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
      if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
      if (url.endsWith('/clients/client-1/contacts') && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toEqual({ name: 'Nia', email: 'nia@example.test', phone: '+15555550100', title: 'Operations' });
        created = true;
        return json({ success: true, data: createdContact }, 201);
      }
      if (url.includes('/clients/client-1/portal-invitations')) return json({ success: true, data: { membership: { id: 'membership-2', status: 'pending', expires_at: asOf } } }, 201);
      if (url.includes('/clients/client-1/portal')) return json({ success: true, data: { ...portal, memberships: [] } });
      if (url.includes('/clients/client-1')) return json({ success: true, data: { client, contacts: { items: created ? [createdContact] : [], pageInfo: { nextCursor: null, hasNextPage: false } } } });
      return json({ error: { message: 'Unexpected test request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;

    renderWorkspace(<ClientPortalAdministration clientId="client-1" />);
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add Contact' }));
    expect(screen.getByRole('alert').textContent).toContain('Contact name and email are required.');
    expect(fetch.mock.calls.some(([url, init]) => url.toString().endsWith('/clients/client-1/contacts') && init?.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Contact name'), 'Nia');
    await user.type(screen.getByLabelText('Contact email'), 'nia@example.test');
    await user.type(screen.getByLabelText('Contact phone'), '+15555550100');
    await user.type(screen.getByLabelText('Contact title'), 'Operations');
    await user.click(screen.getByRole('button', { name: 'Add Contact' }));

    expect((await screen.findByRole('status')).textContent).toContain('Client contact added.');
    expect((await screen.findAllByText(/nia@example\.test/)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('option', { name: 'Nia — nia@example.test' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Client contact'), createdContact.id);
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    const invitation = fetch.mock.calls.find(([url]) => url.toString().includes('/portal-invitations'));
    expect(JSON.parse(invitation?.[1]?.body as string)).toEqual({ contact_id: createdContact.id });
    expect(document.body.textContent).not.toMatch(/token_hash|storage_path|raw-invitation/);
  });
});


describe('Client account deletion confirmation', () => {
  it('requires an exact confirmation, identifies the client, supports cancel, sends one scoped DELETE, and redirects after success', async () => {
    const user = userEvent.setup(); const onDeleted = vi.fn(); const fetch = ownerFetch();
    renderWorkspace(<ClientPortalAdministration clientId="client-1" onDeleted={onDeleted} />);
    await screen.findByRole('heading', { name: 'Acme' });
    await user.click(screen.getByRole('button', { name: 'Delete Client Account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Client Account' });
    expect(dialog.textContent).toContain('client-1'); expect(dialog.textContent).toContain('ava@example.test'); expect(dialog.textContent).toContain('permanently delete');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Delete Client Account' })).toBeNull();
    expect(fetch.mock.calls.some(([url, init]) => url.toString().endsWith('/api/owner-workspace/clients/client-1') && init?.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Delete Client Account' }));
    await user.type(screen.getByLabelText('Confirm client name'), 'Acme ');
    expect((screen.getAllByRole('button', { name: 'Delete Client Account' })[1] as HTMLButtonElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText('Confirm client name')); await user.type(screen.getByLabelText('Confirm client name'), 'Acme');
    await user.click(screen.getAllByRole('button', { name: 'Delete Client Account' })[1]);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    const deletion = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(([url, init]) => url.toString().endsWith('/api/owner-workspace/clients/client-1') && init?.method === 'DELETE');
    expect(deletion?.[1]?.body).toBeUndefined();
  });

  it('disables duplicate deletes while the deletion request is processing', async () => {
    const user = userEvent.setup(); const onDeleted = vi.fn(); let resolveDeletion: (() => void) | undefined;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
      if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
      if (url.includes('/clients/client-1') && init?.method === 'DELETE') return new Promise<Response>((resolve) => { resolveDeletion = () => resolve(json({ success: true, data: {} })); });
      if (url.includes('/clients/client-1/portal')) return json({ success: true, data: portal });
      if (url.includes('/clients/client-1')) return json({ success: true, data: { client, contacts: { items: [contact], pageInfo: { nextCursor: null, hasNextPage: false } } } });
      return json({ error: { message: 'Unexpected test request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;
    renderWorkspace(<ClientPortalAdministration clientId="client-1" onDeleted={onDeleted} />);
    await screen.findByRole('heading', { name: 'Acme' }); await user.click(screen.getByRole('button', { name: 'Delete Client Account' }));
    await user.type(screen.getByLabelText('Confirm client name'), 'Acme');
    const confirmButton = screen.getAllByRole('button', { name: 'Delete Client Account' })[1] as HTMLButtonElement;
    await user.click(confirmButton);
    expect(confirmButton.disabled).toBe(true); expect(confirmButton.textContent).toBe('Deleting…');
    await user.click(confirmButton);
    expect(fetch.mock.calls.filter(([url, init]) => url.toString().endsWith('/api/owner-workspace/clients/client-1') && init?.method === 'DELETE')).toHaveLength(1);
    resolveDeletion?.();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('presents a safe conflict without redirecting', async () => {
    const user = userEvent.setup(); const onDeleted = vi.fn();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
      if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
      if (url.includes('/clients/client-1') && init?.method === 'DELETE') return json({ error: { message: 'Client account cannot be deleted while protected records or shared access remain.' } }, 409);
      if (url.includes('/clients/client-1/portal')) return json({ success: true, data: portal });
      if (url.includes('/clients/client-1')) return json({ success: true, data: { client, contacts: { items: [contact], pageInfo: { nextCursor: null, hasNextPage: false } } } });
      return json({ error: { message: 'Unexpected test request' } }, 500);
    });
    globalThis.fetch = fetch as unknown as typeof fetch;
    renderWorkspace(<ClientPortalAdministration clientId="client-1" onDeleted={onDeleted} />);
    await screen.findByRole('heading', { name: 'Acme' }); await user.click(screen.getByRole('button', { name: 'Delete Client Account' }));
    await user.type(screen.getByLabelText('Confirm client name'), 'Acme'); await user.click(screen.getAllByRole('button', { name: 'Delete Client Account' })[1]);
    expect((await screen.findByRole('alert')).textContent).toContain('protected records'); expect(onDeleted).not.toHaveBeenCalled();
  });
});


it('shows a safe unavailable email result and never submits provisioning', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'token' });
    if (url.endsWith('/api/owner-workspace/bootstrap')) return json(bootstrap);
    if (url.endsWith('/api/owner-workspace/dashboard')) return json(dashboard);
    if (url.includes('/api/owner-workspace/clients?')) return json({ success: true, data: { items: [], pageInfo: { nextCursor: null, hasNextPage: false } } });
    if (url.includes('/api/owner-workspace/client-accounts/email-eligibility?email=blocked%40example.test')) return json({ success: true, data: { eligibility: 'email_unavailable' } });
    return json({ error: { message: 'Unexpected test request' } }, 500);
  });
  globalThis.fetch = fetch as unknown as typeof fetch;
  renderWorkspace(<OwnerClientsWorkspace />);
  await user.click(await screen.findByRole('button', { name: 'Create Client Account' }));
  await user.type(screen.getByLabelText('Client or Company Name'), 'Blocked Client');
  await user.type(screen.getByLabelText('Contact Name'), 'Blocked Contact');
  await user.type(screen.getByLabelText('Email'), 'blocked@example.test');
  await user.tab();
  expect((await screen.findByRole('status')).textContent).toBe('This email cannot be used for a Client account.');
  expect((screen.getByRole('button', { name: 'Create and Send Invitation' }) as HTMLButtonElement).disabled).toBe(true);
  const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
  expect(calls.some(([url, init]) => url.toString().endsWith('/api/owner-workspace/clients/provision') && init?.method === 'POST')).toBe(false);
  const eligibility = calls.find(([url]) => url.toString().includes('/client-accounts/email-eligibility'));
  expect(eligibility?.[1]?.body).toBeUndefined();
});
