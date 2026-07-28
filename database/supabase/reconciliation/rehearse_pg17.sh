#!/usr/bin/env bash
# Isolated synthetic PostgreSQL 17 rehearsal. Never contacts Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECON="$ROOT/reconciliation"
MIGRATIONS="$ROOT/migrations"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$RECON/evidence/$STAMP"
LOG="$EVIDENCE/rehearsal.log"
CONTAINER="jarvis-prime-pg17-rehearsal-$$"
DATABASE="jarvis_rehearsal"
IMAGE="postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94"
FINGERPRINT="5917ae71c2ce1f9a80bbf3d5983afbb0"
EXPECTED=(
  20260715000000_create_outreach_schema.sql
  20260715000001_create_auth_schema.sql
  20260715000002_add_extensibility_columns.sql
  20260715000003_create_leads.sql
  20260715000004_create_crm_foundation.sql
  20260715000005_create_client_management.sql
  20260715000006_create_project_management.sql
  20260715000007_create_crm_tasks.sql
  20260715000008_add_employee_portal_scope.sql
  20260718000009_grant_phase6_service_role_permissions.sql
  20260718000010_create_client_portal.sql
  20260723000011_reconcile_legacy_leads.sql
  20260723000012_enforce_leads_email_uniqueness.sql
  20260723000013_harden_server_only_access.sql
)
mkdir -p "$EVIDENCE"
exec > >(tee "$LOG") 2>&1
cleanup() {
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
command -v docker >/dev/null
command -v shasum >/dev/null
cmp "$RECON/02_reconcile_legacy_leads.sql" "$MIGRATIONS/20260723000011_reconcile_legacy_leads.sql"
cmp "$RECON/03_enforce_leads_email_uniqueness.sql" "$MIGRATIONS/20260723000012_enforce_leads_email_uniqueness.sql"
cmp "$RECON/04_harden_server_only_access.sql" "$MIGRATIONS/20260723000013_harden_server_only_access.sql"
actual=("$MIGRATIONS"/*.sql)
if [[ ${#actual[@]} -ne ${#EXPECTED[@]} ]]; then
  echo "STOP: expected exactly ${#EXPECTED[@]} migration files, found ${#actual[@]}" >&2
  exit 1
fi
for i in "${!EXPECTED[@]}"; do
  if [[ "$(basename "${actual[$i]}")" != "${EXPECTED[$i]}" ]]; then
    echo "STOP: migration order/set mismatch at index $i" >&2
    exit 1
  fi
done
echo "Starting isolated PostgreSQL 17 rehearsal: $STAMP"
docker run --detach --rm --name "$CONTAINER" --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB="$DATABASE" \
  --volume "$ROOT:/workspace:ro" "$IMAGE" >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready --username postgres --dbname "$DATABASE" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]]; then
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker inspect "$CONTAINER" > "$EVIDENCE/container-inspect.json" 2>&1 || true
  docker logs "$CONTAINER" > "$EVIDENCE/container.log" 2>&1 || true
  echo "STOP: PostgreSQL did not become ready within 60 seconds" >&2
  exit 1
fi
run_sql() {
  local file="$1"
  shift
  echo "RUN $(basename "$file")"
  docker exec --interactive "$CONTAINER" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username postgres --dbname "$DATABASE" "$@" < "$file"
}
record_local_migration() {
  local filename="$1" version="${1%%_*}" name="${1#*_}"
  name="${name%.sql}"
  docker exec "$CONTAINER" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username postgres --dbname "$DATABASE" \
    --command "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('$version','$name',ARRAY[]::text[]);" >/dev/null
}
run_sql "$RECON/00_bootstrap_pg17.sql"
run_sql "$RECON/01_legacy_fixture_pg17.sql"
run_sql "$RECON/00_read_only_preflight.sql" \
  --set expected_leads_rows=2 --set expected_outreach_rows=1 \
  --set expected_schema_fingerprint="$FINGERPRINT"
run_sql "$RECON/01_contain_browser_access.sql"
for filename in "${EXPECTED[@]}"; do
  run_sql "$MIGRATIONS/$filename"
  record_local_migration "$filename"
done
run_sql "$RECON/05_verify_pg17.sql" \
  --set expected_leads_rows=2 --set expected_outreach_rows=1
docker exec "$CONTAINER" pg_dump --schema-only --no-owner --no-privileges \
  --username postgres --dbname "$DATABASE" > "$EVIDENCE/final-schema.sql"
docker exec "$CONTAINER" psql --no-psqlrc --csv --username postgres --dbname "$DATABASE" \
  --command "SELECT 'leads' AS object,count(*) AS rows FROM public.leads UNION ALL SELECT 'outreach_log',count(*) FROM public.outreach_log;" \
  > "$EVIDENCE/row-counts.csv"
docker exec "$CONTAINER" psql --no-psqlrc --csv --username postgres --dbname "$DATABASE" \
  --command "SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;" \
  > "$EVIDENCE/migration-history.csv"
docker exec "$CONTAINER" psql --no-psqlrc --csv --username postgres --dbname "$DATABASE" \
  --command "SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY grantee,table_name,privilege_type;" \
  > "$EVIDENCE/table-grants.csv"
shasum -a 256 "$EVIDENCE/final-schema.sql" "$EVIDENCE/row-counts.csv" \
  "$EVIDENCE/migration-history.csv" "$EVIDENCE/table-grants.csv" > "$EVIDENCE/SHA256SUMS.txt"
printf 'image=%s\npostgres_version=' "$IMAGE" > "$EVIDENCE/metadata.txt"
docker exec "$CONTAINER" psql --no-psqlrc --tuples-only --no-align --username postgres \
  --dbname "$DATABASE" --command 'SHOW server_version;' >> "$EVIDENCE/metadata.txt"
printf 'legacy_fingerprint=%s\nnetwork=none\n' "$FINGERPRINT" >> "$EVIDENCE/metadata.txt"
echo "PASS: isolated PostgreSQL 17 rehearsal; evidence: $EVIDENCE"

