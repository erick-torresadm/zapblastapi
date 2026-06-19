
-- 1) Novas colunas de limites
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_active_campaigns INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_contacts_per_list INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_crm_agents INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warmup_tier TEXT NOT NULL DEFAULT 'off' CHECK (warmup_tier IN ('off','basic','advanced'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2) Atualiza dados dos planos (Starter 1, Pro 3, Scale 20)
UPDATE public.subscription_plans SET
  max_chips = 1,
  max_messages_per_day = 1000,
  max_active_campaigns = 1,
  max_contacts_per_list = 500,
  max_crm_agents = 1,
  warmup_tier = 'off',
  description = 'Pra começar: 1 chip, 1.000 msgs/dia, 1 campanha por vez. Sem aquecimento.'
WHERE slug = 'starter';

UPDATE public.subscription_plans SET
  max_chips = 3,
  max_messages_per_day = 5000,
  max_active_campaigns = 5,
  max_contacts_per_list = 5000,
  max_crm_agents = 5,
  warmup_tier = 'basic',
  description = 'Mais popular: 3 chips, 5.000 msgs/dia, 5 campanhas, aquecimento básico, CRM até 5 agentes.'
WHERE slug = 'pro';

UPDATE public.subscription_plans SET
  slug = 'scale',
  name = 'Scale',
  max_chips = 20,
  max_messages_per_day = 25000,
  max_active_campaigns = -1,
  max_contacts_per_list = -1,
  max_crm_agents = -1,
  warmup_tier = 'advanced',
  description = 'Pra escalar: 20 chips, 25.000 msgs/dia, campanhas e contatos ilimitados, aquecimento avançado.'
WHERE slug = 'enterprise';

-- 3) Trigger de novo usuário: trial Pro de 10 dias
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pro_id UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  SELECT id INTO _pro_id FROM public.subscription_plans WHERE slug = 'pro' LIMIT 1;
  IF _pro_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (NEW.id, _pro_id, 'trialing', now() + interval '10 days', now(), now() + interval '10 days')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Função: limites + uso atual do usuário
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSONB;
  _sub RECORD;
  _plan RECORD;
  _used_chips INT;
  _used_campaigns INT;
  _msgs_today INT;
  _trial_expired BOOLEAN;
  _effective_status TEXT;
BEGIN
  SELECT s.*, p.max_chips, p.max_messages_per_day, p.max_active_campaigns,
         p.max_contacts_per_list, p.max_crm_agents, p.warmup_tier,
         p.slug AS plan_slug, p.name AS plan_name
    INTO _sub
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = _user_id;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object('has_subscription', false, 'can_act', false);
  END IF;

  _trial_expired := (_sub.status = 'trialing' AND _sub.trial_ends_at IS NOT NULL AND _sub.trial_ends_at < now());
  _effective_status := CASE WHEN _trial_expired THEN 'past_due' ELSE _sub.status::text END;

  SELECT COUNT(*) INTO _used_chips
    FROM public.whatsapp_instances WHERE user_id = _user_id AND COALESCE(status,'') IN ('connected','open','connecting');

  SELECT COUNT(*) INTO _used_campaigns
    FROM public.campaigns WHERE user_id = _user_id AND COALESCE(status,'') IN ('running','scheduled','queued','paused');

  SELECT COUNT(*) INTO _msgs_today
    FROM public.campaign_messages cm
    JOIN public.campaigns c ON c.id = cm.campaign_id
    WHERE c.user_id = _user_id
      AND cm.created_at >= date_trunc('day', now());

  _result := jsonb_build_object(
    'has_subscription', true,
    'status', _effective_status,
    'plan_slug', _sub.plan_slug,
    'plan_name', _sub.plan_name,
    'trial_ends_at', _sub.trial_ends_at,
    'trial_expired', _trial_expired,
    'can_act', _effective_status IN ('active','trialing'),
    'limits', jsonb_build_object(
      'max_chips', _sub.max_chips,
      'max_messages_per_day', _sub.max_messages_per_day,
      'max_active_campaigns', _sub.max_active_campaigns,
      'max_contacts_per_list', _sub.max_contacts_per_list,
      'max_crm_agents', _sub.max_crm_agents,
      'warmup_tier', _sub.warmup_tier
    ),
    'usage', jsonb_build_object(
      'chips', _used_chips,
      'active_campaigns', _used_campaigns,
      'messages_today', _msgs_today
    )
  );
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_plan_limits(UUID) TO authenticated, service_role;

-- 5) Expirar trials (sem cron — chamado pela função on-read; cria também job opcional se pg_cron existir)
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n INT;
BEGIN
  UPDATE public.subscriptions
    SET status = 'past_due'::subscription_status
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now()
      AND efi_subscription_id IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_trials() TO service_role;

-- 6) Backfill trial_ends_at em assinaturas trialing existentes (10 dias da criação)
UPDATE public.subscriptions
  SET trial_ends_at = created_at + interval '10 days'
  WHERE status = 'trialing' AND trial_ends_at IS NULL;
