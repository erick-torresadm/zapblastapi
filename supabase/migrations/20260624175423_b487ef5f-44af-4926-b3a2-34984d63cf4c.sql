
-- 1) Novas colunas em subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_contact_lists INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_flows INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_traffic_funnels INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_agenda_businesses INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_group_campaigns INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visible_public BOOLEAN NOT NULL DEFAULT TRUE;

-- Default flags por plano existente
UPDATE public.subscription_plans
   SET feature_flags = jsonb_build_object(
     'campaigns', true, 'crm', true, 'flows', false, 'warmup', false,
     'agenda', false, 'traffic_funnels', false, 'group_campaigns', false,
     'tools_maps', true, 'tools_unsaved_contacts', true,
     'csv_export', true, 'api_access', false
   )
 WHERE slug = 'starter';

UPDATE public.subscription_plans
   SET feature_flags = jsonb_build_object(
     'campaigns', true, 'crm', true, 'flows', true, 'warmup', true,
     'agenda', true, 'traffic_funnels', true, 'group_campaigns', true,
     'tools_maps', true, 'tools_unsaved_contacts', true,
     'csv_export', true, 'api_access', false
   ),
   max_flows = 20, max_traffic_funnels = 10, max_agenda_businesses = 3, max_group_campaigns = 10
 WHERE slug = 'pro';

UPDATE public.subscription_plans
   SET feature_flags = jsonb_build_object(
     'campaigns', true, 'crm', true, 'flows', true, 'warmup', true,
     'agenda', true, 'traffic_funnels', true, 'group_campaigns', true,
     'tools_maps', true, 'tools_unsaved_contacts', true,
     'csv_export', true, 'api_access', true
   ),
   max_contact_lists = -1, max_flows = -1, max_traffic_funnels = -1,
   max_agenda_businesses = -1, max_group_campaigns = -1
 WHERE slug = 'scale';

-- 2) RLS: admins enxergam tudo (sem afetar política pública existente)
DROP POLICY IF EXISTS "Admins manage all plans" ON public.subscription_plans;
CREATE POLICY "Admins manage all plans" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Recria RPC get_user_plan_limits incluindo flags e novos limites + usage
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _used_chips INT;
  _used_campaigns INT;
  _used_lists INT;
  _used_flows INT;
  _used_funnels INT;
  _used_agendas INT;
  _used_group_camps INT;
  _used_crm_agents INT;
  _msgs_today INT;
  _trial_expired BOOLEAN;
  _effective_status TEXT;
BEGIN
  SELECT s.*, p.max_chips, p.max_messages_per_day, p.max_active_campaigns,
         p.max_contacts_per_list, p.max_crm_agents, p.warmup_tier,
         p.max_contact_lists, p.max_flows, p.max_traffic_funnels,
         p.max_agenda_businesses, p.max_group_campaigns, p.feature_flags,
         p.monthly_free_maps_searches,
         p.slug AS plan_slug, p.name AS plan_name,
         p.price_cents AS plan_price_cents, p.price_annual_cents AS plan_price_annual_cents
    INTO _sub
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = _user_id;

  IF _sub IS NULL THEN
    RETURN jsonb_build_object('has_subscription', false, 'can_act', false);
  END IF;

  _trial_expired := (_sub.status = 'trialing' AND _sub.trial_ends_at IS NOT NULL AND _sub.trial_ends_at < now());
  _effective_status := CASE WHEN _trial_expired THEN 'past_due' ELSE _sub.status::text END;

  -- Conta apenas chips realmente ativos; ignora 'connecting' parado há mais de 5min
  SELECT COUNT(*) INTO _used_chips
    FROM public.whatsapp_instances
   WHERE user_id = _user_id
     AND (
       COALESCE(status,'') IN ('connected','open')
       OR (COALESCE(status,'') = 'connecting' AND COALESCE(updated_at, created_at) > now() - interval '5 minutes')
     );

  SELECT COUNT(*) INTO _used_campaigns
    FROM public.campaigns WHERE user_id = _user_id AND COALESCE(status,'') IN ('running','scheduled','queued','paused');

  SELECT COUNT(*) INTO _used_lists FROM public.contact_lists WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _used_flows FROM public.flows WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _used_funnels FROM public.traffic_funnels WHERE owner_user_id = _user_id;
  SELECT COUNT(*) INTO _used_agendas FROM public.agenda_businesses WHERE owner_user_id = _user_id;
  SELECT COUNT(*) INTO _used_group_camps FROM public.group_campaigns WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _used_crm_agents FROM public.crm_agents WHERE owner_user_id = _user_id AND active = true;

  SELECT COUNT(*) INTO _msgs_today
    FROM public.campaign_messages cm
    JOIN public.campaigns c ON c.id = cm.campaign_id
   WHERE c.user_id = _user_id
     AND cm.created_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'has_subscription', true,
    'status', _effective_status,
    'plan_slug', _sub.plan_slug,
    'plan_name', _sub.plan_name,
    'plan_price_cents', _sub.plan_price_cents,
    'plan_price_annual_cents', _sub.plan_price_annual_cents,
    'trial_ends_at', _sub.trial_ends_at,
    'trial_expired', _trial_expired,
    'can_act', _effective_status IN ('active','trialing'),
    'limits', jsonb_build_object(
      'max_chips', _sub.max_chips,
      'max_messages_per_day', _sub.max_messages_per_day,
      'max_active_campaigns', _sub.max_active_campaigns,
      'max_contacts_per_list', _sub.max_contacts_per_list,
      'max_crm_agents', _sub.max_crm_agents,
      'max_contact_lists', _sub.max_contact_lists,
      'max_flows', _sub.max_flows,
      'max_traffic_funnels', _sub.max_traffic_funnels,
      'max_agenda_businesses', _sub.max_agenda_businesses,
      'max_group_campaigns', _sub.max_group_campaigns,
      'monthly_free_maps_searches', _sub.monthly_free_maps_searches,
      'warmup_tier', _sub.warmup_tier
    ),
    'feature_flags', COALESCE(_sub.feature_flags, '{}'::jsonb),
    'usage', jsonb_build_object(
      'chips', _used_chips,
      'active_campaigns', _used_campaigns,
      'contact_lists', _used_lists,
      'flows', _used_flows,
      'traffic_funnels', _used_funnels,
      'agenda_businesses', _used_agendas,
      'group_campaigns', _used_group_camps,
      'crm_agents', _used_crm_agents,
      'messages_today', _msgs_today
    )
  );
END;
$$;

-- 4) grant_manual_plan: limpa trial_ends_at e força status='active'
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

  INSERT INTO public.subscriptions(user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  VALUES (_target_user, _plan_id, 'active', NULL, now(), now() + (_duration_days || ' days')::interval)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    trial_ends_at = NULL,
    current_period_start = now(),
    current_period_end = GREATEST(public.subscriptions.current_period_end, now()) + (_duration_days || ' days')::interval,
    updated_at = now()
  RETURNING id INTO _sub_id;

  INSERT INTO public.wallet_transactions(user_id, amount_cents, type, description, balance_after_cents)
  SELECT _target_user, 0, 'topup',
    'Plano ativado manualmente (admin) — ' || _plan.name || ' / ' || _duration_days || ' dias / ' ||
    COALESCE(_method,'externo') || COALESCE(' / ' || _note, '') ||
    ' — valor pago: R$' || (_amount_paid_cents::numeric / 100)::text,
    COALESCE((SELECT balance_cents FROM public.wallets WHERE user_id = _target_user), 0);

  PERFORM public.log_admin_action(
    _admin, 'manual_plan_grant', 'subscription', _sub_id::text,
    jsonb_build_object(
      'target_user', _target_user, 'plan_id', _plan_id, 'plan_name', _plan.name,
      'duration_days', _duration_days, 'amount_paid_cents', _amount_paid_cents,
      'method', _method, 'note', _note
    ),
    NULL, NULL
  );

  RETURN jsonb_build_object('ok', true, 'subscription_id', _sub_id);
END;
$$;

-- 5) Limpa trial_ends_at já travado em quem está 'active' (caso seu Scale)
UPDATE public.subscriptions
   SET trial_ends_at = NULL, updated_at = now()
 WHERE status = 'active' AND trial_ends_at IS NOT NULL;
