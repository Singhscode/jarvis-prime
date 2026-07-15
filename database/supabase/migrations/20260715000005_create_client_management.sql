-- Minimal client-management extension for converted CRM leads.

create table public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  add column client_id uuid references public.crm_clients(id) on delete set null;

alter table public.crm_leads
  add column client_id uuid references public.crm_clients(id) on delete set null;

create index crm_clients_owner_user_id_idx on public.crm_clients (owner_user_id);
create index contacts_client_id_idx on public.contacts (client_id);

alter table public.crm_clients enable row level security;

create trigger crm_clients_updated_at before update on public.crm_clients
  for each row execute procedure public.handle_updated_at();

-- This exists only because the Supabase JavaScript client has no application-level transactions.
create function public.convert_crm_lead_to_client(
  p_owner_user_id uuid,
  p_lead_id uuid,
  p_contact_id uuid,
  p_name text
)
returns public.crm_clients
language plpgsql
as $$
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
