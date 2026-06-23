
ALTER TABLE public.flow_keyword_triggers
  ADD COLUMN IF NOT EXISTS trigger_mode text NOT NULL DEFAULT 'keyword';

ALTER TABLE public.flow_keyword_triggers
  DROP CONSTRAINT IF EXISTS flow_keyword_triggers_trigger_mode_check;
ALTER TABLE public.flow_keyword_triggers
  ADD CONSTRAINT flow_keyword_triggers_trigger_mode_check
  CHECK (trigger_mode IN ('keyword','any_message'));

UPDATE public.subscription_plans SET max_active_campaigns = 2, max_contacts_per_list = 1000 WHERE slug = 'starter';
UPDATE public.subscription_plans SET max_active_campaigns = 10, max_contacts_per_list = 10000 WHERE slug = 'pro';
