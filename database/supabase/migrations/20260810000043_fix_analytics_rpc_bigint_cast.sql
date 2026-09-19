-- Phase 12 Analytics: Corrective migration for bigint cast mismatch.
--
-- Migration 20260810000042_add_analytics_rpcs.sql originally defined
-- get_revenue_by_owner, get_monthly_revenue, and get_expenses_by_owner with
-- SELECT COALESCE(SUM(...), 0) — but PostgreSQL's SUM(bigint) returns
-- numeric, not bigint. Because each function declares
-- RETURNS TABLE(total_amount_minor bigint), calling any of them raised:
--   ERROR: structure of query does not match function result type
--   DETAIL: Returned type numeric does not match expected type bigint in column 1.
--
-- That bug was later fixed by editing 20260810000042 in place to add
-- explicit ::bigint casts. Editing an already-applied migration has no
-- effect on any environment where 20260810000042 was already recorded in
-- supabase_migrations.schema_migrations — the broken function bodies remain
-- live in the database. This migration re-applies the corrected function
-- bodies via CREATE OR REPLACE FUNCTION so the fix actually reaches
-- environments that already ran the original 20260810000042.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.get_revenue_by_owner(p_owner_user_id uuid, p_status text)
RETURNS TABLE(total_amount_minor bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
    SELECT COALESCE(SUM(fi.total_amount_minor), 0)::bigint
    FROM public.finance_invoices fi
    WHERE fi.owner_user_id = p_owner_user_id
      AND fi.status = p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_revenue(p_owner_user_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE(month date, total_amount_minor bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
    SELECT DATE_TRUNC('month', fi.issued_at)::DATE AS month,
           COALESCE(SUM(fi.total_amount_minor), 0)::bigint AS total_amount_minor
    FROM public.finance_invoices fi
    WHERE fi.owner_user_id = p_owner_user_id
      AND fi.status = 'paid'
      AND fi.issued_at::DATE >= p_start_date
      AND fi.issued_at::DATE <= p_end_date
    GROUP BY DATE_TRUNC('month', fi.issued_at)::DATE
    ORDER BY month DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expenses_by_owner(p_owner_user_id uuid, p_status text)
RETURNS TABLE(total_amount_minor bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
    SELECT COALESCE(SUM(fe.amount_minor), 0)::bigint
    FROM public.finance_expenses fe
    WHERE fe.owner_user_id = p_owner_user_id
      AND fe.status = p_status;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_owner IS
  'Returns total revenue amount for a specific owner and status. '
  'Used by getRevenueStats analytics function. RLS-filtered by owner_user_id. '
  'Corrected in 20260810000043 to cast SUM(bigint) (numeric) back to bigint.';

COMMENT ON FUNCTION public.get_monthly_revenue IS
  'Returns monthly revenue breakdown for a date range. '
  'Used by getRevenueStats analytics function. Returns month and total_amount_minor. '
  'Corrected in 20260810000043 to cast SUM(bigint) (numeric) back to bigint.';

COMMENT ON FUNCTION public.get_expenses_by_owner IS
  'Returns total expenses amount for a specific owner and status. '
  'Used by getExpenseStats analytics function. RLS-filtered by owner_user_id. '
  'Corrected in 20260810000043 to cast SUM(bigint) (numeric) back to bigint.';

-- Permissions are unchanged from 20260810000042, but GRANT is idempotent
-- and re-asserted here in case this migration ever runs against a database
-- where the functions did not previously exist.
GRANT EXECUTE ON FUNCTION public.get_revenue_by_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expenses_by_owner TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_revenue_by_owner TO service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue TO service_role;
GRANT EXECUTE ON FUNCTION public.get_expenses_by_owner TO service_role;

COMMIT;
