-- Minimal owner-scoped CRM foundation: companies, contacts, and CRM lead markers.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null check (btrim(name) <> ''),
  email text,
  phone text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  created_at timestamptz not null default now(),
  unique (owner_user_id, contact_id)
);

create index companies_owner_user_id_idx on public.companies (owner_user_id);
create index contacts_owner_user_id_idx on public.contacts (owner_user_id);
create unique index contacts_owner_email_unique_idx
  on public.contacts (owner_user_id, lower(email))
  where email is not null;

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.crm_leads enable row level security;

create trigger companies_updated_at before update on public.companies
  for each row execute procedure public.handle_updated_at();

create trigger contacts_updated_at before update on public.contacts
  for each row execute procedure public.handle_updated_at();
