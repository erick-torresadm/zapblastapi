
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE public.wallet_tx_type AS ENUM ('topup', 'purchase', 'refund', 'adjustment');
CREATE TYPE public.chip_provider AS ENUM ('mock', 'sms_activate', 'fivesim', 'smspool');
CREATE TYPE public.chip_purchase_status AS ENUM ('pending', 'provisioning', 'active', 'failed', 'refunded', 'expired');

-- PLANOS
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  stripe_price_id TEXT,
  max_chips INT NOT NULL DEFAULT 5,
  max_messages_per_day INT NOT NULL DEFAULT 1000,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are public" ON public.subscription_plans FOR SELECT USING (active = TRUE);

-- ASSINATURAS
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_id UUID REFERENCES public.subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CARTEIRA
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  total_topped_up_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (balance_cents >= 0)
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TRANSAÇÕES (imutável: apenas service_role escreve)
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  type public.wallet_tx_type NOT NULL,
  description TEXT,
  stripe_payment_intent_id TEXT,
  chip_purchase_id UUID,
  balance_after_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own tx" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_wallet_tx_user ON public.wallet_transactions(user_id, created_at DESC);

-- CATÁLOGO DE CHIPS
CREATE TABLE public.chip_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  provider_cost_cents INT NOT NULL DEFAULT 0,
  provider public.chip_provider NOT NULL DEFAULT 'mock',
  provider_service_code TEXT NOT NULL DEFAULT 'wa',
  country_code TEXT NOT NULL DEFAULT 'br',
  ttl_minutes INT NOT NULL DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chip_catalog TO authenticated;
GRANT ALL ON public.chip_catalog TO service_role;
ALTER TABLE public.chip_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog public to authed" ON public.chip_catalog FOR SELECT USING (active = TRUE);
CREATE POLICY "Admins manage catalog" ON public.chip_catalog FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_catalog_updated BEFORE UPDATE ON public.chip_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COMPRAS
CREATE TABLE public.chip_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES public.chip_catalog(id),
  price_paid_cents INT NOT NULL,
  provider public.chip_provider NOT NULL,
  provider_order_id TEXT,
  phone_number TEXT,
  sms_code TEXT,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  status public.chip_purchase_status NOT NULL DEFAULT 'pending',
  error TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chip_purchases TO authenticated;
GRANT ALL ON public.chip_purchases TO service_role;
ALTER TABLE public.chip_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own purchases" ON public.chip_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_chip_purchases_user ON public.chip_purchases(user_id, created_at DESC);
CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.chip_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AUTO-CRIAR carteira no signup
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();

-- Garante carteira pros usuários existentes
INSERT INTO public.wallets (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

-- DÉBITO ATÔMICO (SECURITY DEFINER, autoriza pela auth.uid)
CREATE OR REPLACE FUNCTION public.debit_wallet(
  _amount_cents BIGINT,
  _description TEXT,
  _chip_purchase_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _new_balance BIGINT;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  UPDATE public.wallets SET balance_cents = balance_cents - _amount_cents
   WHERE user_id = _user AND balance_cents >= _amount_cents
   RETURNING balance_cents INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, chip_purchase_id, balance_after_cents)
  VALUES (_user, -_amount_cents, 'purchase', _description, _chip_purchase_id, _new_balance);

  RETURN _new_balance;
END;
$$;
GRANT EXECUTE ON FUNCTION public.debit_wallet(BIGINT, TEXT, UUID) TO authenticated;

-- CRÉDITO (service_role apenas — chamado por webhooks/refunds)
CREATE OR REPLACE FUNCTION public.credit_wallet(
  _user_id UUID,
  _amount_cents BIGINT,
  _type public.wallet_tx_type,
  _description TEXT,
  _stripe_pi TEXT DEFAULT NULL,
  _chip_purchase_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance BIGINT;
BEGIN
  INSERT INTO public.wallets (user_id, balance_cents, total_topped_up_cents)
  VALUES (_user_id, _amount_cents, CASE WHEN _type = 'topup' THEN _amount_cents ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE
    SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents,
        total_topped_up_cents = wallets.total_topped_up_cents + CASE WHEN _type = 'topup' THEN _amount_cents ELSE 0 END
  RETURNING balance_cents INTO _new_balance;

  INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, stripe_payment_intent_id, chip_purchase_id, balance_after_cents)
  VALUES (_user_id, _amount_cents, _type, _description, _stripe_pi, _chip_purchase_id, _new_balance);

  RETURN _new_balance;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.credit_wallet(UUID, BIGINT, public.wallet_tx_type, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, BIGINT, public.wallet_tx_type, TEXT, TEXT, UUID) TO service_role;

-- SEED
INSERT INTO public.subscription_plans (slug, name, description, price_cents, max_chips, max_messages_per_day, featured, sort_order) VALUES
  ('starter',    'Starter',    'Pra começar: 5 chips, 1.000 msgs/dia, suporte por email',                  4900,  5, 1000, FALSE, 1),
  ('pro',        'Pro',        'Mais popular: 20 chips, 5.000 msgs/dia, aquecimento ilimitado',           14900, 20, 5000, TRUE,  2),
  ('enterprise', 'Enterprise', 'Pra escala: 100 chips, 25.000 msgs/dia, prioridade no suporte',          39900,100,25000, FALSE, 3);

INSERT INTO public.chip_catalog (name, description, price_cents, provider_cost_cents, provider, provider_service_code, country_code, ttl_minutes, sort_order) VALUES
  ('Chip BR Descartável',  'Número virtual brasileiro pra registro rápido. Vida útil ~20min.',  990, 400, 'mock', 'wa', 'br', 20,  1),
  ('Chip BR Premium',      'Número virtual brasileiro pra uso estendido. Vida útil ~24h.',     2490,1200, 'mock', 'wa', 'br', 1440, 2);
