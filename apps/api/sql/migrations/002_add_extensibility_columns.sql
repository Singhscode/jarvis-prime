-- Migration 002: Add extensibility columns to clients and prospects.
-- These columns enable per-client configuration overrides and flexible data storage.

-- Add config JSONB to clients for per-client settings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='config') THEN
    ALTER TABLE public.clients ADD COLUMN config jsonb DEFAULT '{}';
    COMMENT ON COLUMN public.clients.config IS 'Per-client configuration overrides (scoring weights, send limits, follow-up days, etc.)';
  END IF;
END $$;

-- Add metadata JSONB to prospects for extensible data
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='metadata') THEN
    ALTER TABLE public.prospects ADD COLUMN metadata jsonb DEFAULT '{}';
    COMMENT ON COLUMN public.prospects.metadata IS 'Extensible metadata for prospects (custom fields, enrichment data, etc.)';
  END IF;
END $$;

-- Add tags array to prospects for flexible categorization
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='tags') THEN
    ALTER TABLE public.prospects ADD COLUMN tags text[] DEFAULT '{}';
    COMMENT ON COLUMN public.prospects.tags IS 'Flexible tags for prospect categorization and filtering';
  END IF;
END $$;

-- Add migrations tracking table
CREATE TABLE IF NOT EXISTS public._migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tag-based queries
CREATE INDEX IF NOT EXISTS prospects_tags_idx ON public.prospects USING gin(tags);
