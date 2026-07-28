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
    if (url.includes('/crm/leads')) return json({ success: true, data: { items: [{ id: 'lead-1', contact_id: contact.id, created_at: asOf }], pageInfo: { nextCursor: null, hasNextPage: false } } });
    if (url.includes('/crm/contacts')) return json({ success: true, data: { items: [contact], pageInfo: { nextCursor: null, hasNextPage: false } } });
    if (url.endsWith('/clients') && init?.method === 'POST') return json({ success: true, data: client }, 201);
    if (url.includes('/clients?')) return json({ success: true, data: { items: [client], pageInfo: { nextCursor: null, hasNextPage: false } } });
    if (url.includes('/clients/client-1') && init?.method === 'PATCH') return json({ success: true, data: client });
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

  it('converts an owned lead through a scoped selector', async () => {
    const user = userEvent.setup(); const fetch = ownerFetch();
    renderWorkspace(<OwnerClientsWorkspace />);
    await user.selectOptions(await screen.findByLabelText('Owned lead'), 'lead-1');
    await user.type(screen.getByLabelText('Client name'), 'Acme converted');
    await user.click(screen.getByRole('button', { name: 'Convert lead' }));
    expect((await screen.findByRole('status')).textContent).toContain('Lead converted to a client.');
    const call = (fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>).find(([url, init]) => url.toString().endsWith('/clients') && init?.method === 'POST');
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({ lead_id: 'lead-1', name: 'Acme converted' });
  });

  it('administers Client Portal invitations without exposing invitation material', async () => {
    const user = userEvent.setup(); const fetch = ownerFetch();
    renderWorkspace(<ClientPortalAdministration clientId="client-1" />);
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy();
    await user.clear(screen.getByLabelText('Edit client name')); await user.type(screen.getByLabelText('Edit client name'), 'Acme renamed'); await user.click(screen.getByRole('button', { name: 'Save client name' }));
    expect((await screen.findByRole('status')).textContent).toContain('Client name updated.');
    await user.selectOptions(screen.getByLabelText('Client contact'), contact.id); await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect((await screen.findByRole('status')).textContent).toContain('Invitation sent.');
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('status')).textContent).toContain('Client Portal access revoked.');
    await user.click(screen.getByRole('button', { name: 'Next memberships' }));
    const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    await waitFor(() => expect(calls.some(([url]) => url.toString().includes('/portal?cursor=MQ'))).toBe(true));
    const invite = calls.find(([url]) => url.toString().includes('/portal-invitations'));
    const rename = calls.find(([url, init]) => url.toString().includes('/clients/client-1') && init?.method === 'PATCH');
    expect(JSON.parse(rename?.[1]?.body as string)).toEqual({ name: 'Acme renamed' });
    expect(JSON.parse(invite?.[1]?.body as string)).toEqual({ contact_id: contact.id });
    expect(calls.some(([url]) => url.toString().includes('/resend'))).toBe(true);
    expect(calls.some(([url, init]) => url.toString().includes('/portal-members/membership-1') && init?.method === 'DELETE')).toBe(true);
    expect(document.body.textContent).not.toMatch(/token_hash|storage_path|raw-invitation/);
  });
});


it('creates CRM companies, contacts, and leads through the existing owner-scoped endpoints', async () => {
  const user = userEvent.setup();
  const fetch = ownerFetch();
  renderWorkspace(<OwnerCrmWorkspace />);

  await user.type(await screen.findByLabelText('Company name'), 'New company');
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  expect((await screen.findByRole('status')).textContent).toContain('Company created.');

  await user.click(screen.getByRole('tab', { name: 'Contacts' }));
  await user.type(await screen.findByLabelText('Contact name'), 'New contact');
  await user.type(screen.getByLabelText('Contact email'), 'new.contact@example.test');
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect((await screen.findByRole('status')).textContent).toContain('Contact created.');

  await user.click(screen.getByRole('tab', { name: 'Leads' }));
  await user.selectOptions(await screen.findByLabelText('Lead contact'), contact.id);
  await user.click(screen.getByRole('button', { name: 'Create lead' }));
  expect((await screen.findByRole('status')).textContent).toContain('Lead created.');

  const calls = fetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
  const post = (suffix: string) => calls.find(([url, init]) => url.toString().endsWith(suffix) && init?.method === 'POST');
  expect(JSON.parse(post('/crm/companies')?.[1]?.body as string)).toEqual({ name: 'New company' });
  expect(JSON.parse(post('/crm/contacts')?.[1]?.body as string)).toEqual({ name: 'New contact', email: 'new.contact@example.test' });
  expect(JSON.parse(post('/crm/leads')?.[1]?.body as string)).toEqual({ contact_id: contact.id });
});