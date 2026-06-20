
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE;

-- Backfill: for existing rows, use created_at so the column is never null when present
UPDATE public.subscriptions
SET current_period_start = COALESCE(current_period_start, created_at);
