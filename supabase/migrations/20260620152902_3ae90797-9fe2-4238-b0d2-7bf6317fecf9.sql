
-- ============================================
-- COUPONS
-- ============================================
CREATE TYPE public.coupon_type AS ENUM ('percent', 'fixed', 'free');

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type public.coupon_type NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0, -- percent: 0-100; fixed: cents; free: ignored
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  free_duration_days INT, -- only for type='free'
  expires_at TIMESTAMPTZ,
  max_redemptions INT, -- NULL = unlimited
  max_per_user INT NOT NULL DEFAULT 1,
  redemptions_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupons_code ON public.coupons(code);
CREATE INDEX idx_coupons_active ON public.coupons(active) WHERE active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active coupons (needed to validate)
CREATE POLICY "Authenticated can view active coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Admins can view all coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert coupons"
  ON public.coupons FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update coupons"
  ON public.coupons FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete coupons"
  ON public.coupons FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- COUPON REDEMPTIONS
-- ============================================
CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  final_cents BIGINT NOT NULL DEFAULT 0,
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own redemptions"
  ON public.coupon_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role inserts redemptions"
  ON public.coupon_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================
-- VALIDATE COUPON
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_coupon(_code TEXT, _plan_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _c RECORD;
  _plan RECORD;
  _user_uses INT;
  _base_cents BIGINT;
  _discount BIGINT := 0;
  _final BIGINT := 0;
BEGIN
  IF _user IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO _c FROM public.coupons WHERE upper(code) = upper(_code) AND active = true;
  IF _c IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido ou expirado');
  END IF;

  IF _c.expires_at IS NOT NULL AND _c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom expirado');
  END IF;

  IF _c.max_redemptions IS NOT NULL AND _c.redemptions_count >= _c.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom esgotado');
  END IF;

  IF _c.plan_id IS NOT NULL AND _plan_id IS NOT NULL AND _c.plan_id <> _plan_id THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom não válido para este plano');
  END IF;

  SELECT COUNT(*) INTO _user_uses
    FROM public.coupon_redemptions
    WHERE coupon_id = _c.id AND user_id = _user;
  IF _user_uses >= _c.max_per_user THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Você já utilizou este cupom');
  END IF;

  IF _plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.subscription_plans WHERE id = _plan_id;
    IF _plan IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'message', 'Plano inválido');
    END IF;
    _base_cents := COALESCE(_plan.price_cents, 0);
  ELSE
    _base_cents := 0;
  END IF;

  IF _c.type = 'percent' THEN
    _discount := (_base_cents * LEAST(GREATEST(_c.value, 0), 100) / 100)::BIGINT;
  ELSIF _c.type = 'fixed' THEN
    _discount := LEAST(_c.value::BIGINT, _base_cents);
  ELSIF _c.type = 'free' THEN
    _discount := _base_cents;
  END IF;

  _final := GREATEST(_base_cents - _discount, 0);

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', _c.id,
    'type', _c.type,
    'value', _c.value,
    'free_duration_days', _c.free_duration_days,
    'base_cents', _base_cents,
    'discount_cents', _discount,
    'final_cents', _final,
    'message', 'Cupom válido'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(TEXT, UUID) FROM PUBLIC;

-- ============================================
-- REDEEM COUPON
-- ============================================
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  _code TEXT,
  _plan_id UUID,
  _subscription_id UUID DEFAULT NULL,
  _payment_intent_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _v JSONB;
  _coupon_id UUID;
  _discount BIGINT;
  _final BIGINT;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  _v := public.validate_coupon(_code, _plan_id);
  IF NOT (_v->>'valid')::boolean THEN
    RETURN _v;
  END IF;

  _coupon_id := (_v->>'coupon_id')::uuid;
  _discount := (_v->>'discount_cents')::bigint;
  _final := (_v->>'final_cents')::bigint;

  INSERT INTO public.coupon_redemptions(coupon_id, user_id, plan_id, subscription_id, discount_cents, final_cents, payment_intent_id)
  VALUES (_coupon_id, _user, _plan_id, _subscription_id, _discount, _final, _payment_intent_id);

  UPDATE public.coupons SET redemptions_count = redemptions_count + 1 WHERE id = _coupon_id;

  RETURN _v || jsonb_build_object('redeemed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(TEXT, UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(TEXT, UUID, UUID, TEXT) FROM PUBLIC;

-- ============================================
-- APPLY FREE COUPON (creates/extends active subscription)
-- ============================================
CREATE OR REPLACE FUNCTION public.apply_free_coupon(_code TEXT, _plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _v JSONB;
  _c RECORD;
  _sub_id UUID;
  _duration INT;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  _v := public.validate_coupon(_code, _plan_id);
  IF NOT (_v->>'valid')::boolean THEN RETURN _v; END IF;

  SELECT * INTO _c FROM public.coupons WHERE id = (_v->>'coupon_id')::uuid;
  IF _c.type <> 'free' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom não é gratuito');
  END IF;

  _duration := COALESCE(_c.free_duration_days, 30);

  INSERT INTO public.subscriptions(user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (_user, _plan_id, 'active', now(), now() + (_duration || ' days')::interval)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = now(),
    current_period_end = GREATEST(public.subscriptions.current_period_end, now()) + (_duration || ' days')::interval,
    updated_at = now()
  RETURNING id INTO _sub_id;

  INSERT INTO public.coupon_redemptions(coupon_id, user_id, plan_id, subscription_id, discount_cents, final_cents)
  VALUES (_c.id, _user, _plan_id, _sub_id, (_v->>'discount_cents')::bigint, 0);

  UPDATE public.coupons SET redemptions_count = redemptions_count + 1 WHERE id = _c.id;

  RETURN jsonb_build_object('valid', true, 'redeemed', true, 'subscription_id', _sub_id, 'duration_days', _duration);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_free_coupon(TEXT, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.apply_free_coupon(TEXT, UUID) FROM PUBLIC;

-- ============================================
-- ADMIN: GRANT MANUAL PLAN (external payment)
-- ============================================
CREATE OR REPLACE FUNCTION public.grant_manual_plan(
  _target_user UUID,
  _plan_id UUID,
  _duration_days INT,
  _amount_paid_cents BIGINT,
  _method TEXT,
  _note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin UUID := auth.uid();
  _sub_id UUID;
  _plan RECORD;
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Apenas admins podem ativar planos manualmente';
  END IF;

  IF _duration_days IS NULL OR _duration_days <= 0 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  SELECT * INTO _plan FROM public.subscription_plans WHERE id = _plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Plano não encontrado'; END IF;

  INSERT INTO public.subscriptions(user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (_target_user, _plan_id, 'active', now(), now() + (_duration_days || ' days')::interval)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = now(),
    current_period_end = GREATEST(public.subscriptions.current_period_end, now()) + (_duration_days || ' days')::interval,
    updated_at = now()
  RETURNING id INTO _sub_id;

  -- Registra no extrato como referência (sem creditar saldo de carteira)
  INSERT INTO public.wallet_transactions(user_id, amount_cents, type, description, balance_after_cents)
  SELECT _target_user, 0, 'topup',
    'Plano ativado manualmente (admin) — ' || _plan.name || ' / ' || _duration_days || ' dias / ' ||
    COALESCE(_method,'externo') || COALESCE(' / ' || _note, '') ||
    ' — valor pago: R$' || (_amount_paid_cents::numeric / 100)::text,
    COALESCE((SELECT balance_cents FROM public.wallets WHERE user_id = _target_user), 0);

  -- Auditoria
  PERFORM public.log_admin_action(
    _admin, 'manual_plan_grant', 'subscription', _sub_id::text,
    jsonb_build_object(
      'target_user', _target_user,
      'plan_id', _plan_id,
      'plan_name', _plan.name,
      'duration_days', _duration_days,
      'amount_paid_cents', _amount_paid_cents,
      'method', _method,
      'note', _note
    ),
    NULL, NULL
  );

  RETURN jsonb_build_object('ok', true, 'subscription_id', _sub_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_manual_plan(UUID, UUID, INT, BIGINT, TEXT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.grant_manual_plan(UUID, UUID, INT, BIGINT, TEXT, TEXT) FROM PUBLIC;
