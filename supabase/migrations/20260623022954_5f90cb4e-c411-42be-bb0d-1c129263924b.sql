ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS warmup_pool_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_pool_joined_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instances_pool
  ON public.whatsapp_instances (warmup_pool_opt_in, warmup_enabled, status)
  WHERE warmup_pool_opt_in = true AND warmup_enabled = true;