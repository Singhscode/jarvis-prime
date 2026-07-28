--
-- PostgreSQL database dump
--

\restrict T0FJqW9vfkoyRHmJL7W1LPPuvAQqJ0dlpKjwFjlUEEHSslVrWpb3VhfwAnklaIT

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: activate_client_portal_invitation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_client_portal_invitation(p_user_id uuid, p_token_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: complete_employee_portal_task(uuid, uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_employee_portal_task(p_employee_user_id uuid, p_task_id uuid, p_completed boolean, p_justification text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  portal_owner_id uuid;
  task_row public.crm_tasks%rowtype;
  old_completed boolean;
begin
  if p_completed is null or p_justification is null
    or char_length(btrim(p_justification)) not between 1 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select u.portal_owner_user_id into portal_owner_id
  from public.users u
  where u.id = p_employee_user_id
    and u.role = 'employee'
    and u.status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  end if;
  if portal_owner_id is null then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_SCOPE_MISSING';
  end if;

  select t.* into task_row
  from public.crm_tasks t
  where t.id = p_task_id
    and t.owner_user_id = portal_owner_id
    and t.assigned_user_id = p_employee_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TASK_NOT_FOUND';
  end if;

  old_completed := task_row.completed;
  update public.crm_tasks
  set completed = p_completed
  where id = task_row.id
  returning * into task_row;

  insert into public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, details
  ) values (
    p_employee_user_id,
    'employee_portal_task_completion',
    'update',
    'crm_task',
    task_row.id,
    jsonb_build_object(
      'justification', btrim(p_justification),
      'old_completed', old_completed,
      'new_completed', task_row.completed
    )
  );

  return jsonb_build_object(
    'id', task_row.id,
    'project_id', task_row.project_id,
    'name', task_row.name,
    'completed', task_row.completed
  );
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: crm_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_clients_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: convert_crm_lead_to_client(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convert_crm_lead_to_client(p_owner_user_id uuid, p_lead_id uuid, p_contact_id uuid, p_name text) RETURNS public.crm_clients
    LANGUAGE plpgsql
    AS $$
declare
  created_client public.crm_clients;
begin
  insert into public.crm_clients (owner_user_id, name)
  values (p_owner_user_id, p_name)
  returning * into created_client;

  update public.contacts
  set client_id = created_client.id
  where id = p_contact_id and owner_user_id = p_owner_user_id and client_id is null;
  if not found then raise exception 'Client contact update failed'; end if;

  update public.crm_leads
  set client_id = created_client.id
  where id = p_lead_id and owner_user_id = p_owner_user_id and client_id is null;
  if not found then raise exception 'CRM lead update failed'; end if;

  return created_client;
end;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: publish_client_portal_document(uuid, uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_client_portal_document(p_owner_user_id uuid, p_client_id uuid, p_project_id uuid, p_storage_bucket text, p_storage_path text, p_title text, p_document_type text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: reissue_client_portal_invitation(uuid, uuid, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reissue_client_portal_invitation(p_owner_user_id uuid, p_client_id uuid, p_contact_id uuid, p_token_hash text, p_expires_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: revoke_client_portal_membership(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_client_portal_membership(p_owner_user_id uuid, p_client_id uuid, p_membership_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: ab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ab_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    test_type text DEFAULT 'subject'::text NOT NULL,
    variants jsonb NOT NULL,
    results jsonb DEFAULT '{}'::jsonb,
    winner text,
    min_sample integer DEFAULT 50,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    action text NOT NULL,
    resource_type text,
    resource_id uuid,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    ip_address text,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    step_number integer NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    delay_days integer DEFAULT 0 NOT NULL,
    template_key text,
    variant text DEFAULT 'A'::text,
    subject text,
    body_template text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    channels text[] DEFAULT '{email}'::text[],
    daily_limit integer DEFAULT 50,
    ab_test_id uuid,
    settings jsonb DEFAULT '{}'::jsonb,
    stats jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_portal_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    crm_client_id uuid NOT NULL,
    project_id uuid,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    title text NOT NULL,
    document_type text NOT NULL,
    client_visible boolean DEFAULT true NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT client_portal_documents_document_type_check CHECK ((document_type = ANY (ARRAY['deliverable'::text, 'report'::text]))),
    CONSTRAINT client_portal_documents_storage_bucket_check CHECK ((storage_bucket = 'client-portal-private'::text)),
    CONSTRAINT client_portal_documents_storage_path_check CHECK ((btrim(storage_path) <> ''::text)),
    CONSTRAINT client_portal_documents_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: client_portal_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT client_portal_invitations_check CHECK ((expires_at > created_at)),
    CONSTRAINT client_portal_invitations_token_hash_check CHECK ((btrim(token_hash) <> ''::text))
);


--
-- Name: client_portal_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    crm_client_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email_normalized text NOT NULL,
    status text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT client_portal_memberships_check CHECK ((((status = 'pending'::text) AND (activated_at IS NULL) AND (revoked_at IS NULL)) OR ((status = 'active'::text) AND (activated_at IS NOT NULL) AND (revoked_at IS NULL)) OR ((status = 'revoked'::text) AND (revoked_at IS NOT NULL)))),
    CONSTRAINT client_portal_memberships_email_normalized_check CHECK (((btrim(email_normalized) <> ''::text) AND (email_normalized = lower(btrim(email_normalized))))),
    CONSTRAINT client_portal_memberships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'revoked'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_email text,
    icp_titles text[] DEFAULT '{}'::text[],
    icp_industries text[] DEFAULT '{}'::text[],
    icp_locations text[] DEFAULT '{}'::text[],
    icp_keywords text[] DEFAULT '{}'::text[],
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: COLUMN clients.config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.config IS 'Per-client configuration overrides (scoring weights, send limits, follow-up days, etc.)';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT companies_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    company_id uuid,
    name text NOT NULL,
    email text,
    phone text,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid,
    CONSTRAINT contacts_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: crm_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid
);


--
-- Name: crm_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    CONSTRAINT crm_projects_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: crm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    assigned_user_id uuid,
    CONSTRAINT crm_tasks_name_check CHECK ((btrim(name) <> ''::text))
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    verification_ip text
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospect_id uuid,
    message_id uuid,
    type text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    company text,
    email text NOT NULL,
    phone text,
    revenue text,
    message text,
    source text DEFAULT 'website'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    linkedin_url text,
    icp_score integer,
    data_quality text,
    last_contact_at timestamp with time zone,
    next_action text,
    enriched_at timestamp with time zone
);


--
-- Name: COLUMN leads.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.notes IS 'Temporary legacy compatibility field; remove only through a separately approved migration.';


--
-- Name: linkedin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospect_id uuid,
    campaign_id uuid,
    action_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    error text,
    provider_id text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospect_id uuid,
    client_id uuid,
    channel text DEFAULT 'email'::text NOT NULL,
    step integer DEFAULT 1 NOT NULL,
    subject text,
    body text,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_id text,
    error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    recipient text,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outreach_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    channel text NOT NULL,
    step integer DEFAULT 1 NOT NULL,
    subject text,
    body text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    replied boolean DEFAULT false,
    reply_type text
);


--
-- Name: TABLE outreach_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.outreach_log IS 'Legacy compatibility table; remove only through a separately approved migration.';


--
-- Name: password_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_ip text
);


--
-- Name: prospects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    full_name text,
    first_name text,
    title text,
    company text,
    email text,
    linkedin_url text,
    industry text,
    location text,
    source text DEFAULT 'apollo'::text,
    icp_score integer DEFAULT 0,
    qualified boolean DEFAULT false,
    hot boolean DEFAULT false,
    score_reasons text[],
    stage text DEFAULT 'new'::text NOT NULL,
    step integer DEFAULT 0 NOT NULL,
    next_action_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT '{}'::text[]
);


--
-- Name: COLUMN prospects.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospects.metadata IS 'Extensible metadata for prospects (custom fields, enrichment data, etc.)';


--
-- Name: COLUMN prospects.tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospects.tags IS 'Flexible tags for prospect categorization and filtering';


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: scheduled_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_jobs (
    id text NOT NULL,
    name text NOT NULL,
    cron text NOT NULL,
    task text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    last_status text,
    last_error text,
    run_count integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_id text,
    device_name text,
    ip_address text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text
);


--
-- Name: suppression; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppression (
    email text NOT NULL,
    reason text DEFAULT 'unsubscribe'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    email_normalized text NOT NULL,
    username text,
    full_name text,
    password_hash text,
    status text DEFAULT 'pending_verification'::text NOT NULL,
    role text DEFAULT 'client'::text NOT NULL,
    email_verified_at timestamp with time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    last_failed_login_at timestamp with time zone,
    account_locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    portal_owner_user_id uuid
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    error text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    public boolean DEFAULT false NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    name text,
    statements text[]
);


--
-- Name: ab_tests ab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT ab_tests_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: campaign_steps campaign_steps_campaign_id_step_number_variant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_campaign_id_step_number_variant_key UNIQUE (campaign_id, step_number, variant);


--
-- Name: campaign_steps campaign_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: client_portal_documents client_portal_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_documents
    ADD CONSTRAINT client_portal_documents_pkey PRIMARY KEY (id);


--
-- Name: client_portal_invitations client_portal_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_invitations
    ADD CONSTRAINT client_portal_invitations_pkey PRIMARY KEY (id);


--
-- Name: client_portal_invitations client_portal_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_invitations
    ADD CONSTRAINT client_portal_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: client_portal_memberships client_portal_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_memberships
    ADD CONSTRAINT client_portal_memberships_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_clients crm_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_clients
    ADD CONSTRAINT crm_clients_pkey PRIMARY KEY (id);


--
-- Name: crm_leads crm_leads_owner_user_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_owner_user_id_contact_id_key UNIQUE (owner_user_id, contact_id);


--
-- Name: crm_leads crm_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);


--
-- Name: crm_projects crm_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_projects
    ADD CONSTRAINT crm_projects_pkey PRIMARY KEY (id);


--
-- Name: crm_tasks crm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_email_key UNIQUE (email);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: linkedin_actions linkedin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_actions
    ADD CONSTRAINT linkedin_actions_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: outreach_log outreach_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT outreach_log_pkey PRIMARY KEY (id);


--
-- Name: password_history password_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: prospects prospects_client_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects
    ADD CONSTRAINT prospects_client_id_email_key UNIQUE (client_id, email);


--
-- Name: prospects prospects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects
    ADD CONSTRAINT prospects_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: scheduled_jobs scheduled_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: suppression suppression_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppression
    ADD CONSTRAINT suppression_pkey PRIMARY KEY (email);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_email_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_normalized_key UNIQUE (email_normalized);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: ab_tests_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ab_tests_client_idx ON public.ab_tests USING btree (client_id);


--
-- Name: campaign_steps_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_steps_campaign_idx ON public.campaign_steps USING btree (campaign_id);


--
-- Name: campaigns_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_client_idx ON public.campaigns USING btree (client_id);


--
-- Name: client_portal_active_membership_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_portal_active_membership_user_idx ON public.client_portal_memberships USING btree (user_id) WHERE (status = 'active'::text);


--
-- Name: client_portal_documents_bucket_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_portal_documents_bucket_path_idx ON public.client_portal_documents USING btree (storage_bucket, storage_path);


--
-- Name: client_portal_open_membership_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_portal_open_membership_contact_idx ON public.client_portal_memberships USING btree (contact_id) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text]));


--
-- Name: client_portal_usable_invitation_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_portal_usable_invitation_membership_idx ON public.client_portal_invitations USING btree (membership_id) WHERE ((consumed_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: client_portal_visible_documents_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_visible_documents_client_idx ON public.client_portal_documents USING btree (crm_client_id, created_at DESC) WHERE (client_visible AND (revoked_at IS NULL));


--
-- Name: companies_owner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_owner_user_id_idx ON public.companies USING btree (owner_user_id);


--
-- Name: contacts_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_client_id_idx ON public.contacts USING btree (client_id);


--
-- Name: contacts_owner_email_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_owner_email_unique_idx ON public.contacts USING btree (owner_user_id, lower(email)) WHERE (email IS NOT NULL);


--
-- Name: contacts_owner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_owner_user_id_idx ON public.contacts USING btree (owner_user_id);


--
-- Name: crm_clients_owner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_clients_owner_user_id_idx ON public.crm_clients USING btree (owner_user_id);


--
-- Name: crm_projects_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_projects_client_id_idx ON public.crm_projects USING btree (client_id);


--
-- Name: crm_projects_owner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_projects_owner_user_id_idx ON public.crm_projects USING btree (owner_user_id);


--
-- Name: crm_tasks_assigned_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_assigned_user_id_idx ON public.crm_tasks USING btree (assigned_user_id);


--
-- Name: crm_tasks_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_tasks_project_id_idx ON public.crm_tasks USING btree (project_id);


--
-- Name: events_prospect_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_prospect_idx ON public.events USING btree (prospect_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_email_verifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verifications_user_id ON public.email_verification_tokens USING btree (user_id);


--
-- Name: idx_password_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_history_user_id ON public.password_history USING btree (user_id);


--
-- Name: idx_password_resets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_resets_user_id ON public.password_resets USING btree (user_id);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: leads_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_created_at_idx ON public.leads USING btree (created_at DESC);


--
-- Name: leads_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_status_idx ON public.leads USING btree (status);


--
-- Name: linkedin_actions_prospect_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX linkedin_actions_prospect_idx ON public.linkedin_actions USING btree (prospect_id);


--
-- Name: messages_prospect_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_prospect_idx ON public.messages USING btree (prospect_id);


--
-- Name: outreach_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_lead_idx ON public.outreach_log USING btree (lead_id);


--
-- Name: prospects_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospects_client_idx ON public.prospects USING btree (client_id);


--
-- Name: prospects_next_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospects_next_idx ON public.prospects USING btree (next_action_at);


--
-- Name: prospects_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospects_stage_idx ON public.prospects USING btree (stage);


--
-- Name: prospects_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospects_tags_idx ON public.prospects USING gin (tags);


--
-- Name: webhook_events_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_source_idx ON public.webhook_events USING btree (source);


--
-- Name: ab_tests ab_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ab_tests_updated_at BEFORE UPDATE ON public.ab_tests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: campaigns campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: clients clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: companies companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: contacts contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: crm_clients crm_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_clients_updated_at BEFORE UPDATE ON public.crm_clients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: leads leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: prospects prospects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prospects_updated_at BEFORE UPDATE ON public.prospects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: scheduled_jobs scheduled_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER scheduled_jobs_updated_at BEFORE UPDATE ON public.scheduled_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: ab_tests ab_tests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ab_tests
    ADD CONSTRAINT ab_tests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: campaign_steps campaign_steps_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_steps
    ADD CONSTRAINT campaign_steps_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_portal_documents client_portal_documents_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_documents
    ADD CONSTRAINT client_portal_documents_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: client_portal_documents client_portal_documents_crm_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_documents
    ADD CONSTRAINT client_portal_documents_crm_client_id_fkey FOREIGN KEY (crm_client_id) REFERENCES public.crm_clients(id) ON DELETE RESTRICT;


--
-- Name: client_portal_documents client_portal_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_documents
    ADD CONSTRAINT client_portal_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.crm_projects(id) ON DELETE RESTRICT;


--
-- Name: client_portal_invitations client_portal_invitations_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_invitations
    ADD CONSTRAINT client_portal_invitations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: client_portal_invitations client_portal_invitations_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_invitations
    ADD CONSTRAINT client_portal_invitations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.client_portal_memberships(id) ON DELETE RESTRICT;


--
-- Name: client_portal_memberships client_portal_memberships_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_memberships
    ADD CONSTRAINT client_portal_memberships_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT;


--
-- Name: client_portal_memberships client_portal_memberships_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_memberships
    ADD CONSTRAINT client_portal_memberships_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: client_portal_memberships client_portal_memberships_crm_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_memberships
    ADD CONSTRAINT client_portal_memberships_crm_client_id_fkey FOREIGN KEY (crm_client_id) REFERENCES public.crm_clients(id) ON DELETE RESTRICT;


--
-- Name: client_portal_memberships client_portal_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_memberships
    ADD CONSTRAINT client_portal_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: companies companies_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_clients crm_clients_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_clients
    ADD CONSTRAINT crm_clients_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_leads crm_leads_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(id) ON DELETE SET NULL;


--
-- Name: crm_leads crm_leads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: crm_leads crm_leads_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_leads
    ADD CONSTRAINT crm_leads_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_projects crm_projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_projects
    ADD CONSTRAINT crm_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.crm_clients(id) ON DELETE RESTRICT;


--
-- Name: crm_projects crm_projects_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_projects
    ADD CONSTRAINT crm_projects_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: crm_tasks crm_tasks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: crm_tasks crm_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_tasks
    ADD CONSTRAINT crm_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.crm_projects(id) ON DELETE RESTRICT;


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: events events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: events events_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE CASCADE;


--
-- Name: linkedin_actions linkedin_actions_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_actions
    ADD CONSTRAINT linkedin_actions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: linkedin_actions linkedin_actions_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_actions
    ADD CONSTRAINT linkedin_actions_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE CASCADE;


--
-- Name: messages messages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: messages messages_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE CASCADE;


--
-- Name: outreach_log outreach_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT outreach_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: password_history password_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_resets password_resets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: prospects prospects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects
    ADD CONSTRAINT prospects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_portal_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_portal_owner_user_id_fkey FOREIGN KEY (portal_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ab_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: email_verification_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: linkedin_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.linkedin_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;

--
-- Name: password_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

--
-- Name: password_resets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

--
-- Name: prospects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: suppression; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppression ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict T0FJqW9vfkoyRHmJL7W1LPPuvAQqJ0dlpKjwFjlUEEHSslVrWpb3VhfwAnklaIT

