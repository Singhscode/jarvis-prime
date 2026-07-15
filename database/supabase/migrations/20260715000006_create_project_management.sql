-- Minimal owner-scoped projects for existing CRM clients.

create table public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  name text not null check (btrim(name) <> '')
);

create index crm_projects_owner_user_id_idx on public.crm_projects (owner_user_id);

alter table public.crm_projects enable row level security;
