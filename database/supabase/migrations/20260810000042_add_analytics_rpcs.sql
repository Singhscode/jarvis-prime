-- Phase 12 Analytics: Server-only RPC functions for dashboard aggregations.
-- Uses RLS and owner filtering. Service role can bypass RLS for aggregations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Get revenue totals by owner and status (for dashboard)
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

-- Get monthly revenue breakdown for date range
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

-- Get expense totals by owner and status
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

-- Get prospect counts by stage for a client (or all if NULL)
CREATE OR REPLACE FUNCTION public.get_prospect_stage_counts(p_client_id uuid DEFAULT NULL)
RETURNS TABLE(stage text, count integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_client_id IS NULL THEN
    RETURN QUERY
      SELECT p.stage, COUNT(*)::integer
      FROM public.prospects p
      GROUP BY p.stage
      ORDER BY COUNT(*) DESC;
  ELSE
    RETURN QUERY
      SELECT p.stage, COUNT(*)::integer
      FROM public.prospects p
      WHERE p.client_id = p_client_id
      GROUP BY p.stage
      ORDER BY COUNT(*) DESC;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_owner IS
  'Returns total revenue amount for a specific owner and status. '
  'Used by getRevenueStats analytics function. RLS-filtered by owner_user_id.';

COMMENT ON FUNCTION public.get_monthly_revenue IS
  'Returns monthly revenue breakdown for a date range. '
  'Used by getRevenueStats analytics function. Returns month and total_amount_minor.';

COMMENT ON FUNCTION public.get_expenses_by_owner IS
  'Returns total expenses amount for a specific owner and status. '
  'Used by getExpenseStats analytics function. RLS-filtered by owner_user_id.';

COMMENT ON FUNCTION public.get_prospect_stage_counts IS
  'Returns prospect counts grouped by stage. '
  'Optionally filtered by client_id. Used by getProspectCounts.';

-- Grant permissions to authenticated users for analytics functions
GRANT EXECUTE ON FUNCTION public.get_revenue_by_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expenses_by_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prospect_stage_counts TO authenticated;

-- Grant service role full access for background jobs
GRANT EXECUTE ON FUNCTION public.get_revenue_by_owner TO service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue TO service_role;
GRANT EXECUTE ON FUNCTION public.get_expenses_by_owner TO service_role;
GRANT EXECUTE ON FUNCTION public.get_prospect_stage_counts TO service_role;

COMMIT;
