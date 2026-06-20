ALTER TABLE public.group_campaigns
  ADD COLUMN IF NOT EXISTS extra_participants text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS admin_participants text[] NOT NULL DEFAULT '{}';