-- Phase 7 Client Portal: additive external-client boundary.
-- This migration is intentionally not applied by implementation tooling.

create table public.client_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  crm_client_id uuid not null references public.crm_clients(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  email_normalized text not null check (
    btrim(email_normalized) <> ''
    and email_normalized = lower(btrim(email_normalized))
  ),
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  check (
    (status = 'pending' and activated_at is null and revoked_at is null)
    or (status = 'active' and activated_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create table public.client_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.client_portal_memberships(id) on delete restrict,
  token_hash text not null unique check (btrim(token_hash) <> ''),
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create table public.client_portal_documents (
  id uuid primary key default gen_random_uuid(),
  crm_client_id uuid not null references public.crm_clients(id) on delete restrict,
  project_id uuid references public.crm_projects(id) on delete restrict,
  storage_bucket text not null check (storage_bucket = 'client-portal-private'),
  storage_path text not null check (btrim(storage_path) <> ''),
  title text not null check (btrim(title) <> ''),
  document_type text not null check (document_type in ('deliverable', 'report')),
  client_visible boolean not null default true,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index client_portal_active_membership_user_idx
  on public.client_portal_memberships (user_id)
  where status = 'active';

create unique index client_portal_open_membership_contact_idx
  on public.client_portal_memberships (contact_id)
  where status in ('pending', 'active');

create unique index client_portal_usable_invitation_membership_idx
  on public.client_portal_invitations (membership_id)
  where consumed_at is null and revoked_at is null;

create index crm_projects_client_id_idx
  on public.crm_projects (client_id);

create index client_portal_visible_documents_client_idx
  on public.client_portal_documents (crm_client_id, created_at desc)
  where client_visible and revoked_at is null;

create unique index client_portal_documents_bucket_path_idx
  on public.client_portal_documents (storage_bucket, storage_path);

alter table public.client_portal_memberships enable row level security;
alter table public.client_portal_invitations enable row level security;
alter table public.client_portal_documents enable row level security;

insert into storage.buckets (id, name, public)
values ('client-portal-private', 'client-portal-private', false)
on conflict (id) do update set public = false;

create function public.reissue_client_portal_invitation(
  p_owner_user_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  contact_row public.contacts%rowtype;
  target_user public.users%rowtype;
  membership_row public.client_portal_memberships%rowtype;
  existing_membership_id uuid;
  invitation_action text := 'create';
begin
  if p_token_hash is null or char_length(btrim(p_token_hash)) not between 32 and 256
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '24 hours' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform 1
  from public.crm_clients c
  where c.id = p_client_id
    and c.owner_user_id = p_owner_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
  end if;

  select c.* into contact_row
  from public.contacts c
  where c.id = p_contact_id
    and c.owner_user_id = p_owner_user_id
    and c.client_id = p_client_id
  for update;
  if not found or contact_row.email is null or btrim(contact_row.email) = '' then
    raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
  end if;

  select u.* into target_user
  from public.users u
  where u.email_normalized = lower(btrim(contact_row.email))
    and u.role = 'client'
    and u.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
  end if;

  select m.id into existing_membership_id
  from public.client_portal_memberships m
  where m.user_id = target_user.id
    and m.status in ('pending', 'active')
  for update;

  if found then
    select m.* into membership_row
    from public.client_portal_memberships m
    where m.id = existing_membership_id
    for update;

    if membership_row.status <> 'pending'
      or membership_row.contact_id <> p_contact_id
      or membership_row.crm_client_id <> p_client_id then
      raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
    end if;
    invitation_action := 'resend';
  else
    insert into public.client_portal_memberships (
      crm_client_id, contact_id, user_id, email_normalized, status, created_by_user_id
    ) values (
      p_client_id, p_contact_id, target_user.id, target_user.email_normalized, 'pending', p_owner_user_id
    ) returning * into membership_row;
  end if;

  update public.client_portal_invitations
  set revoked_at = now()
  where membership_id = membership_row.id
    and consumed_at is null
    and revoked_at is null;

  insert into public.client_portal_invitations (
    membership_id, token_hash, created_by_user_id, expires_at
  ) values (
    membership_row.id, btrim(p_token_hash), p_owner_user_id, p_expires_at
  );

  update public.client_portal_memberships
  set updated_at = now()
  where id = membership_row.id;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_owner_user_id, 'client_portal_invitation', invitation_action,
    'client_portal_membership', membership_row.id,
    jsonb_build_object('client_id', p_client_id, 'contact_id', p_contact_id)
  );

  return jsonb_build_object(
    'membership_id', membership_row.id,
    'status', 'pending',
    'expires_at', p_expires_at
  );
end;
$$;

create function public.activate_client_portal_invitation(
  p_user_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user public.users%rowtype;
  invitation_row public.client_portal_invitations%rowtype;
  membership_row public.client_portal_memberships%rowtype;
  contact_id uuid;
  has_other_active_membership boolean;
begin
  select u.* into target_user
  from public.users u
  where u.id = p_user_id
    and u.role = 'client'
    and u.status = 'active'
  for update;

  if not found then
    insert into public.audit_logs (
      event_type, action, resource_type, success, details
    ) values (
      'client_portal_invitation', 'activate', 'client_portal_membership', false,
      jsonb_build_object('outcome', 'failure')
    );
    return jsonb_build_object('activated', false);
  end if;

  select i.* into invitation_row
  from public.client_portal_invitations i
  where i.token_hash = btrim(p_token_hash)
  for update;

  if not found then
    insert into public.audit_logs (
      user_id, event_type, action, resource_type, success, details
    ) values (
      p_user_id, 'client_portal_invitation', 'activate', 'client_portal_membership', false,
      jsonb_build_object('outcome', 'failure')
    );
    return jsonb_build_object('activated', false);
  end if;

  select m.* into membership_row
  from public.client_portal_memberships m
  where m.id = invitation_row.membership_id
  for update;

  if not found then
    insert into public.audit_logs (
      user_id, event_type, action, resource_type, success, details
    ) values (
      p_user_id, 'client_portal_invitation', 'activate', 'client_portal_membership', false,
      jsonb_build_object('outcome', 'failure')
    );
    return jsonb_build_object('activated', false);
  end if;

  select c.id into contact_id
  from public.contacts c
  where c.id = membership_row.contact_id
    and c.client_id = membership_row.crm_client_id
  for update;

  select exists (
    select 1
    from public.client_portal_memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.id <> membership_row.id
  ) into has_other_active_membership;

  if invitation_row.consumed_at is not null
    or invitation_row.revoked_at is not null
    or invitation_row.expires_at <= now()
    or membership_row.status <> 'pending'
    or membership_row.user_id <> p_user_id
    or membership_row.email_normalized <> target_user.email_normalized
    or contact_id is null
    or has_other_active_membership then
    insert into public.audit_logs (
      user_id, event_type, action, resource_type, resource_id, success, details
    ) values (
      p_user_id, 'client_portal_invitation', 'activate', 'client_portal_membership', membership_row.id,
      false, jsonb_build_object('outcome', 'failure')
    );
    return jsonb_build_object('activated', false);
  end if;

  update public.client_portal_memberships
  set status = 'active', activated_at = now(), updated_at = now()
  where id = membership_row.id;

  update public.client_portal_invitations
  set consumed_at = now()
  where id = invitation_row.id;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_user_id, 'client_portal_invitation', 'activate', 'client_portal_membership', membership_row.id,
    jsonb_build_object('client_id', membership_row.crm_client_id)
  );

  return jsonb_build_object('activated', true);
end;
$$;

create function public.revoke_client_portal_membership(
  p_owner_user_id uuid,
  p_client_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.client_portal_memberships%rowtype;
begin
  perform 1
  from public.crm_clients c
  where c.id = p_client_id
    and c.owner_user_id = p_owner_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
  end if;

  select m.* into membership_row
  from public.client_portal_memberships m
  where m.id = p_membership_id
    and m.crm_client_id = p_client_id
    and m.status in ('pending', 'active')
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PORTAL_MEMBER_NOT_FOUND';
  end if;

  update public.client_portal_memberships
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = membership_row.id;

  update public.client_portal_invitations
  set revoked_at = now()
  where membership_id = membership_row.id
    and consumed_at is null
    and revoked_at is null;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_owner_user_id, 'client_portal_membership', 'revoke', 'client_portal_membership', membership_row.id,
    jsonb_build_object('client_id', p_client_id)
  );

  return jsonb_build_object('id', membership_row.id, 'status', 'revoked');
end;
$$;

create function public.publish_client_portal_document(
  p_owner_user_id uuid,
  p_client_id uuid,
  p_project_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_title text,
  p_document_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.client_portal_documents%rowtype;
begin
  if p_storage_bucket <> 'client-portal-private'
    or p_storage_path is null or btrim(p_storage_path) = ''
    or p_title is null or btrim(p_title) = ''
    or p_document_type not in ('deliverable', 'report') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform 1
  from public.crm_clients c
  where c.id = p_client_id
    and c.owner_user_id = p_owner_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PORTAL_DOCUMENT_NOT_FOUND';
  end if;

  if p_project_id is not null then
    perform 1
    from public.crm_projects p
    where p.id = p_project_id
      and p.client_id = p_client_id
      and p.owner_user_id = p_owner_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'PORTAL_DOCUMENT_NOT_FOUND';
    end if;
  end if;

  insert into public.client_portal_documents (
    crm_client_id, project_id, storage_bucket, storage_path, title, document_type, created_by_user_id
  ) values (
    p_client_id, p_project_id, p_storage_bucket, btrim(p_storage_path), btrim(p_title),
    p_document_type, p_owner_user_id
  ) returning * into document_row;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_owner_user_id, 'client_portal_document', 'publish', 'client_portal_document', document_row.id,
    jsonb_build_object('client_id', p_client_id, 'project_id', p_project_id)
  );

  return jsonb_build_object(
    'id', document_row.id,
    'project_id', document_row.project_id,
    'title', document_row.title,
    'document_type', document_row.document_type,
    'created_at', document_row.created_at
  );
end;
$$;

revoke all on function public.reissue_client_portal_invitation(uuid, uuid, uuid, text, timestamptz) from public;
revoke all on function public.activate_client_portal_invitation(uuid, text) from public;
revoke all on function public.revoke_client_portal_membership(uuid, uuid, uuid) from public;
revoke all on function public.publish_client_portal_document(uuid, uuid, uuid, text, text, text, text) from public;

grant usage on schema public to service_role;
grant select on table public.client_portal_memberships to service_role;
grant select, update on table public.client_portal_documents to service_role;
grant execute on function public.reissue_client_portal_invitation(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.activate_client_portal_invitation(uuid, text) to service_role;
grant execute on function public.revoke_client_portal_membership(uuid, uuid, uuid) to service_role;
grant execute on function public.publish_client_portal_document(uuid, uuid, uuid, text, text, text, text) to service_role;
