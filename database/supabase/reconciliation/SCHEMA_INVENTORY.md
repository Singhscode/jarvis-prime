# Production schema inventory — 2026-07-23

Source: verified read-only dump from `fytnwpnnvqecjmyhrzcx`, PostgreSQL 17.6.1.121. Application-relevant schemas: `public`, `auth`, `storage`, `extensions`; system/provider internals remain provider-managed.

## Tables and columns (33 tables)
- `auth.audit_log_entries`: instance_id,id,payload,created_at,ip_address
- `auth.custom_oauth_providers`: id,provider_type,identifier,name,client_id,client_secret,acceptable_client_ids,scopes,pkce_enabled,attribute_mapping,authorization_params,enabled,email_optional,issuer,discovery_url,skip_nonce_check,cached_discovery,discovery_cached_at,authorization_url,token_url,userinfo_url,jwks_uri,created_at,updated_at,custom_claims_allowlist
- `auth.flow_state`: id,user_id,auth_code,code_challenge_method,code_challenge,provider_type,provider_access_token,provider_refresh_token,created_at,updated_at,authentication_method,auth_code_issued_at,invite_token,referrer,oauth_client_state_id,linking_target_id,email_optional
- `auth.identities`: provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at,email,id
- `auth.instances`: id,uuid,raw_base_config,created_at,updated_at
- `auth.mfa_amr_claims`: session_id,created_at,updated_at,authentication_method,id
- `auth.mfa_challenges`: id,factor_id,created_at,verified_at,ip_address,otp_code,web_authn_session_data
- `auth.mfa_factors`: id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret,phone,last_challenged_at,web_authn_credential,web_authn_aaguid,last_webauthn_challenge_data
- `auth.oauth_authorizations`: id,authorization_id,client_id,user_id,redirect_uri,scope,state,resource,code_challenge,code_challenge_method,response_type,status,authorization_code,created_at,expires_at,approved_at,nonce
- `auth.oauth_client_states`: id,provider_type,code_verifier,created_at
- `auth.oauth_clients`: id,client_secret_hash,registration_type,redirect_uris,grant_types,client_name,client_uri,logo_uri,created_at,updated_at,deleted_at,client_type,token_endpoint_auth_method
- `auth.oauth_consents`: id,user_id,client_id,scopes,granted_at,revoked_at
- `auth.one_time_tokens`: id,user_id,token_type,token_hash,relates_to,created_at,updated_at
- `auth.refresh_tokens`: instance_id,id,token,user_id,revoked,created_at,updated_at,parent,session_id
- `auth.saml_providers`: id,sso_provider_id,entity_id,metadata_xml,metadata_url,attribute_mapping,created_at,updated_at,name_id_format
- `auth.saml_relay_states`: id,sso_provider_id,request_id,for_email,redirect_to,created_at,updated_at,flow_state_id
- `auth.schema_migrations`: version
- `auth.sessions`: id,user_id,created_at,updated_at,factor_id,aal,not_after,refreshed_at,user_agent,ip,tag,oauth_client_id,refresh_token_hmac_key,refresh_token_counter,scopes
- `auth.sso_domains`: id,sso_provider_id,domain,created_at,updated_at
- `auth.sso_providers`: id,resource_id,created_at,updated_at,disabled
- `auth.users`: instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,invited_at,confirmation_token,confirmation_sent_at,recovery_token,recovery_sent_at,email_change_token_new,email_change,email_change_sent_at,last_sign_in_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,created_at,updated_at,phone,phone_confirmed_at,phone_change,phone_change_token,phone_change_sent_at,confirmed_at,email_change_token_current,email_change_confirm_status,banned_until,reauthentication_token,reauthentication_sent_at,is_sso_user,deleted_at,is_anonymous
- `auth.webauthn_challenges`: id,user_id,challenge_type,session_data,created_at,expires_at
- `auth.webauthn_credentials`: id,user_id,credential_id,public_key,attestation_type,aaguid,sign_count,transports,backup_eligible,backed_up,friendly_name,created_at,updated_at,last_used_at
- `public.leads`: id,name,company,email,phone,revenue,message,source,status,notes,created_at,updated_at
- `public.outreach_log`: id,lead_id,channel,step,subject,body,sent_at,replied,reply_type
- `storage.buckets`: id,name,owner,created_at,updated_at,public,avif_autodetection,file_size_limit,allowed_mime_types,owner_id,type
- `storage.buckets_analytics`: name,type,format,created_at,updated_at,id,deleted_at
- `storage.buckets_vectors`: id,type,created_at,updated_at
- `storage.migrations`: id,name,hash,executed_at
- `storage.objects`: id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,path_tokens,version,owner_id,user_metadata
- `storage.s3_multipart_uploads`: id,in_progress_size,upload_signature,bucket_id,key,version,owner_id,created_at,user_metadata,metadata
- `storage.s3_multipart_uploads_parts`: id,upload_id,size,part_number,bucket_id,key,etag,owner_id,version,created_at
- `storage.vector_indexes`: id,name,bucket_id,data_type,dimension,distance_metric,metadata_configuration,created_at,updated_at
## Constraints, indexes, foreign keys, triggers
- Primary/unique constraints: 44 total; public: `leads_pkey`, `outreach_log_pkey`; canonical email uniqueness is absent.
- Foreign keys: 23 total; public: `outreach_log_lead_id_fkey → leads(id) ON DELETE CASCADE`; remaining keys are provider-managed auth/storage relationships.
- Indexes: 69 total; public: `leads_created_at_idx`, `leads_email_idx` (non-unique), `leads_status_idx`, `outreach_lead_idx`; 65 provider-managed auth/storage indexes.
- Triggers: `public.leads_updated_at`; storage: `enforce_bucket_name_length_trigger`, `protect_buckets_delete`, `protect_objects_delete`, `update_objects_updated_at`.

## Functions and extensions
- Public: `handle_updated_at()`.
- Auth: `email()`, `jwt()`, `role()`, `uid()`.
- Storage: `allow_any_operation`, `allow_only_operation`, `can_insert_object`, `enforce_bucket_name_length`, `extension`, `filename`, `foldername`, `get_common_prefix`, `get_size_by_bucket`, `list_multipart_uploads_with_delimiter`, `list_objects_with_delimiter`, `operation`, `protect_delete`, `search`, `search_by_timestamp`, `search_v2`, `update_updated_at_column`.
- Extension-management functions: `grant_pg_cron_access`, `grant_pg_graphql_access`, `grant_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`, `set_graphql_placeholder`.
- Supabase-managed extension schemas are provider-owned; no canonical migration changes them. `gen_random_uuid()` is available on PostgreSQL 17.

## Reconciliation baseline gate
- Exact legacy fingerprint verified by the PostgreSQL 17 synthetic equivalent: `5917ae71c2ce1f9a80bbf3d5983afbb0`.
- Production preflight remains fail-closed on the captured empty migration history, two-table public set, zero lead/outreach rows, empty Storage buckets, exact PostgreSQL 17 ACL model (including `MAINTAIN`), and all detailed catalog assertions.
- This inventory remains the immutable before-state; no production SQL was run while preparing the package.

## RLS, grants, and Storage
- RLS enabled: `public.leads`, `public.outreach_log`, plus provider-managed auth/storage tables as dumped.
- Public policies: `anon_insert_only` on leads; unrestricted `service_role_all` on leads; unrestricted `service_role_all_outreach` on outreach_log.
- Existing explicit grants: ALL on both public tables and `handle_updated_at()` to `anon`, `authenticated`, and `service_role`; broad matching default privileges.
- Storage buckets: 0; storage objects: 0.
- Row counts: public.leads=0, public.outreach_log=0, auth.users=0.
