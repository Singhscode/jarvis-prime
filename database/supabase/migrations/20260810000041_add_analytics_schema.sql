-- Add Phase 12 Analytics Schema
-- Supports dashboard metrics, revenue reports, daily aggregations.

-- Create analytics_daily_metrics table for daily roll-ups
CREATE TABLE public.analytics_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  
  -- CRM Metrics
  crm_leads_created INT DEFAULT 0,
  crm_leads_qualified INT DEFAULT 0,
  crm_leads_converted INT DEFAULT 0,
  
  -- Finance Metrics
  finance_revenue_minor BIGINT DEFAULT 0,  -- cents/paise
  finance_invoices_issued INT DEFAULT 0,
  finance_payments_received_minor BIGINT DEFAULT 0,
  finance_expenses_submitted INT DEFAULT 0,
  
  -- Communication Metrics
  communication_threads_created INT DEFAULT 0,
  communication_messages_sent INT DEFAULT 0,
  communication_delivery_failed INT DEFAULT 0,
  
  -- Automation Metrics
  automation_runs_completed INT DEFAULT 0,
  automation_runs_failed INT DEFAULT 0,
  automation_work_items_completed INT DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (owner_user_id, metric_date),
  CHECK (metric_date >= DATE '2026-01-01'),
  CHECK (crm_leads_created >= 0),
  CHECK (crm_leads_qualified >= 0),
  CHECK (crm_leads_converted >= 0),
  CHECK (finance_revenue_minor >= 0),
  CHECK (finance_invoices_issued >= 0),
  CHECK (finance_payments_received_minor >= 0),
  CHECK (finance_expenses_submitted >= 0),
  CHECK (communication_threads_created >= 0),
  CHECK (communication_messages_sent >= 0),
  CHECK (communication_delivery_failed >= 0),
  CHECK (automation_runs_completed >= 0),
  CHECK (automation_runs_failed >= 0),
  CHECK (automation_work_items_completed >= 0)
);

-- Index for common queries: (owner_user_id, metric_date DESC)
CREATE INDEX idx_analytics_daily_metrics_owner_date 
  ON public.analytics_daily_metrics(owner_user_id, metric_date DESC);

-- Enable RLS
ALTER TABLE public.analytics_daily_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Owner can only access their own metrics
CREATE POLICY "analytics_owner_isolation"
  ON public.analytics_daily_metrics
  FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Grant appropriate permissions
-- Service role can insert/update for nightly aggregations
GRANT SELECT, INSERT, UPDATE ON public.analytics_daily_metrics TO authenticated;
GRANT ALL ON public.analytics_daily_metrics TO service_role;

-- Add updated_at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE
  ON public.analytics_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.analytics_daily_metrics IS
  'Daily aggregated metrics across CRM, Finance, Communication, and Automation modules. '
  'Computed nightly or on-demand for dashboard display. Scoped to owner_user_id for tenant isolation.';

COMMENT ON COLUMN public.analytics_daily_metrics.owner_user_id IS
  'Owner account ID. Primary scoping key for tenant isolation.';

COMMENT ON COLUMN public.analytics_daily_metrics.metric_date IS
  'UTC date (start of day) for which metrics apply. Used as composite key with owner_user_id.';

COMMENT ON COLUMN public.analytics_daily_metrics.finance_revenue_minor IS
  'Total revenue in minor units (cents/paise) for invoices marked as paid.';

COMMENT ON COLUMN public.analytics_daily_metrics.communication_delivery_failed IS
  'Count of communication deliveries that reached permanent failure state.';

COMMENT ON COLUMN public.analytics_daily_metrics.automation_runs_completed IS
  'Count of automation runs that completed successfully within the day.';
