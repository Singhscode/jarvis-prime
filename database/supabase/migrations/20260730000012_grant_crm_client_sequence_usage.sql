-- Allow service-role inserts to evaluate the database-generated client number default.
grant usage on sequence public.crm_clients_client_number_seq to service_role;
