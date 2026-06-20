
-- 1. Extend coupons & plans
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS tool_scope TEXT,
  ADD COLUMN IF NOT EXISTS tool_free_uses INT NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_free_maps_searches INT NOT NULL DEFAULT 0;

-- 2. tool_credits table
CREATE TABLE IF NOT EXISTS public.tool_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  remaining INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'coupon',
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  note TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tool_credits TO authenticated;
GRANT ALL ON public.tool_credits TO service_role;
ALTER TABLE public.tool_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tool credits"
  ON public.tool_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tool_credits_user_tool
  ON public.tool_credits(user_id, tool) WHERE remaining > 0;

CREATE TRIGGER trg_tool_credits_updated
  BEFORE UPDATE ON public.tool_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. consume_tool_credit (returns true if a credit was consumed)
CREATE OR REPLACE FUNCTION public.consume_tool_credit(_tool TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _row_id UUID;
BEGIN
  IF _user IS NULL THEN RETURN FALSE; END IF;

  -- Lazy monthly plan refill: if user has a plan with monthly_free_maps_searches > 0,
  -- ensure there's at least one active 'plan' row that hasn't expired this month.
  IF _tool = 'maps_search' THEN
    INSERT INTO public.tool_credits(user_id, tool, remaining, source, note, expires_at)
    SELECT _user, 'maps_search', sp.monthly_free_maps_searches, 'plan',
           'Cota mensal do plano ' || sp.name,
           date_trunc('month', now()) + interval '1 month'
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.user_id = _user
      AND s.status IN ('active','trialing')
      AND sp.monthly_free_maps_searches > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.tool_credits tc
        WHERE tc.user_id = _user AND tc.tool = 'maps_search' AND tc.source = 'plan'
          AND tc.created_at >= date_trunc('month', now())
      )
    LIMIT 1;
  END IF;

  -- Find oldest active credit row with remaining > 0, decrement it
  SELECT id INTO _row_id
  FROM public.tool_credits
  WHERE user_id = _user
    AND tool = _tool
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY (expires_at IS NULL), expires_at ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _row_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.tool_credits
    SET remaining = remaining - 1, updated_at = now()
    WHERE id = _row_id;

  RETURN TRUE;
END;
$$;

-- 4. refund_tool_credit (give back 1)
CREATE OR REPLACE FUNCTION public.refund_tool_credit(_user_id UUID, _tool TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add a small refund row so the user gets the credit back without expiry
  INSERT INTO public.tool_credits(user_id, tool, remaining, source, note)
  VALUES (_user_id, _tool, 1, 'admin', 'Reembolso automático: busca sem resultados');
END;
$$;

-- 5. redeem_tool_credit_coupon
CREATE OR REPLACE FUNCTION public.redeem_tool_credit_coupon(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _c RECORD;
  _user_uses INT;
BEGIN
  IF _user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO _c FROM public.coupons
    WHERE upper(code) = upper(_code) AND active = true;
  IF _c IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Cupom inválido');
  END IF;

  IF _c.tool_scope IS NULL OR _c.tool_free_uses <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Este cupom não concede uso de ferramentas');
  END IF;

  IF _c.expires_at IS NOT NULL AND _c.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Cupom expirado');
  END IF;

  IF _c.max_redemptions IS NOT NULL AND _c.redemptions_count >= _c.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Cupom esgotado');
  END IF;

  SELECT COUNT(*) INTO _user_uses
    FROM public.coupon_redemptions
    WHERE coupon_id = _c.id AND user_id = _user;
  IF _user_uses >= _c.max_per_user THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você já utilizou este cupom');
  END IF;

  INSERT INTO public.tool_credits(user_id, tool, remaining, source, coupon_id, note, expires_at)
  VALUES (_user, _c.tool_scope, _c.tool_free_uses, 'coupon', _c.id,
          'Resgate do cupom ' || _c.code, _c.expires_at);

  INSERT INTO public.coupon_redemptions(coupon_id, user_id, plan_id, subscription_id, discount_cents, final_cents)
  VALUES (_c.id, _user, NULL, NULL, 0, 0);

  UPDATE public.coupons SET redemptions_count = redemptions_count + 1 WHERE id = _c.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tool', _c.tool_scope,
    'granted', _c.tool_free_uses,
    'message', 'Você ganhou ' || _c.tool_free_uses || ' uso(s) grátis em ' || _c.tool_scope
  );
END;
$$;

-- 6. get_tool_credits_balance
CREATE OR REPLACE FUNCTION public.get_tool_credits_balance(_tool TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _result JSONB;
BEGIN
  IF _user IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_object_agg(tool, total), '{}'::jsonb) INTO _result
  FROM (
    SELECT tool, SUM(remaining)::INT AS total
    FROM public.tool_credits
    WHERE user_id = _user
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
      AND (_tool IS NULL OR tool = _tool)
    GROUP BY tool
  ) t;

  RETURN _result;
END;
$$;
