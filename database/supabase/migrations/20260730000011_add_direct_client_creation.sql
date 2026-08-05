-- Additive direct-client fields and one database-generated display ID.

create sequence public.crm_clients_client_number_seq;

alter table public.crm_clients
  add column client_number bigint,
  add column email text,
  add column phone text,
  add column company text,
  add column notes text;

alter sequence public.crm_clients_client_number_seq
  owned by public.crm_clients.client_number;

alter table public.crm_clients
  alter column client_number set default nextval('public.crm_clients_client_number_seq');

update public.crm_clients
set client_number = nextval('public.crm_clients_client_number_seq')
where client_number is null;

select setval(
  'public.crm_clients_client_number_seq',
  coalesce((select max(client_number) from public.crm_clients), 1),
  exists (select 1 from public.crm_clients)
);

alter table public.crm_clients
  alter column client_number set not null,
  add column client_code text generated always as (
    'JP-CLI-' || case
      when client_number < 1000000 then lpad(client_number::text, 6, '0')
      else client_number::text
    end
  ) stored,
  add constraint crm_clients_client_number_unique unique (client_number),
  add constraint crm_clients_client_code_unique unique (client_code),
  add constraint crm_clients_notes_length check (notes is null or char_length(notes) <= 2000);

create unique index crm_clients_owner_email_unique_idx
  on public.crm_clients (owner_user_id, lower(email))
  where email is not null;
