
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_annual_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_price_id_annual text;

UPDATE public.subscription_plans SET price_annual_cents = 47040 WHERE slug = 'starter';
UPDATE public.subscription_plans SET price_annual_cents = 143040 WHERE slug = 'pro';
UPDATE public.subscription_plans SET price_annual_cents = 383040 WHERE slug = 'enterprise';
