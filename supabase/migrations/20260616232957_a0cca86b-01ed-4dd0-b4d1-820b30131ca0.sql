ALTER TABLE public.flow_keyword_triggers
  ADD COLUMN IF NOT EXISTS allow_from_me boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delay_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_triggered_at timestamptz;