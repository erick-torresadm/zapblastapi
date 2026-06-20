
ALTER TABLE public.group_campaigns
  ADD COLUMN IF NOT EXISTS auto_refill boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_refill_template text;
