-- Minimal owner-scoped tasks for existing CRM projects.

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.crm_projects(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  completed boolean not null default false
);

create index crm_tasks_project_id_idx on public.crm_tasks (project_id);

alter table public.crm_tasks enable row level security;
