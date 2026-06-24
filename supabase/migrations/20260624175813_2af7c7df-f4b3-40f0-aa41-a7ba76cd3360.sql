
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

  SELECT COUNT(*) INTO _used_chips
    FROM public.whatsapp_instances
   WHERE user_id = _user_id
     AND (
       status::text IN ('connected','open')
       OR (status::text = 'connecting' AND COALESCE(updated_at, created_at) > now() - interval '5 minutes')
     );

  SELECT COUNT(*) INTO _used_campaigns
    FROM public.campaigns WHERE user_id = _user_id AND COALESCE(status::text,'') IN ('running','scheduled','queued','paused');

  SELECT COUNT(*) INTO _used_lists FROM public.contact_lists WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _used_flows FROM public.flows WHERE user_id = _user_id;
  SELECT COUNT(*) INTO _used_funnels FROM public.traffic_funnels WHERE owner_user_id = _user_id;
  SELECT COUNT(*) INTO _used_agendas FROM public.agenda_businesses WHERE owner_user_id = _user_id;
  SELECT COUNT(*) INTO _used_group_camps FROM public.group_campaigns WHERE owner_user_id = _user_id;
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
