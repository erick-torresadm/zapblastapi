
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS min_delay_ms integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS max_delay_ms integer NOT NULL DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS hourly_limit integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS quiet_start_hour smallint NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS quiet_end_hour smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS typing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS typing_wpm integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS validate_numbers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sent_hour integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_hour_at timestamptz;

-- Eleva daily_limit padrão para 300 nas linhas que ainda estão no default antigo (<= 100)
UPDATE public.whatsapp_instances SET daily_limit = 300 WHERE daily_limit IS NULL OR daily_limit < 300;

ALTER TABLE public.whatsapp_instances ALTER COLUMN daily_limit SET DEFAULT 300;
