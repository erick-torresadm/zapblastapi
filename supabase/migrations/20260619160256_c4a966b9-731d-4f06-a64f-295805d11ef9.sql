
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS efi_plan_id_sandbox BIGINT,
  ADD COLUMN IF NOT EXISTS efi_plan_id_prod BIGINT;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS efi_subscription_id BIGINT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_efi_sub_id ON public.subscriptions(efi_subscription_id);
