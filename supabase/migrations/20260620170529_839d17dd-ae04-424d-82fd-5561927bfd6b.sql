
CREATE OR REPLACE FUNCTION public.get_published_funnel_by_slug(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _f public.traffic_funnels;
  _steps jsonb;
  _logic jsonb;
  _legacy_blocks jsonb;
  _safe_settings jsonb;
BEGIN
  SELECT * INTO _f FROM public.traffic_funnels WHERE slug = _slug AND status = 'published';
  IF _f.id IS NULL THEN RETURN NULL; END IF;

  -- Steps com seus blocos
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'position', s.position,
      'name', s.name,
      'type', s.type,
      'settings', s.settings,
      'next_step_id', s.next_step_id,
      'blocks', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', b.id, 'type', b.type, 'position', b.position,
          'props', b.props, 'field_key', b.field_key
        ) ORDER BY b.position)
        FROM public.traffic_blocks b WHERE b.step_id = s.id
      ), '[]'::jsonb)
    ) ORDER BY s.position
  ), '[]'::jsonb)
  INTO _steps
  FROM public.traffic_steps s WHERE s.funnel_id = _f.id;

  -- Logic
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'step_id', l.step_id, 'block_id', l.block_id,
    'condition', l.condition, 'next_step_id', l.next_step_id,
    'redirect_url', l.redirect_url, 'position', l.position
  ) ORDER BY l.position), '[]'::jsonb)
  INTO _logic
  FROM public.traffic_logic l WHERE l.funnel_id = _f.id;

  -- Blocos legados (sem step_id) — pra retrocompat
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'type', b.type, 'position', b.position,
    'props', b.props, 'field_key', b.field_key
  ) ORDER BY b.position), '[]'::jsonb)
  INTO _legacy_blocks
  FROM public.traffic_blocks b WHERE b.funnel_id = _f.id AND b.step_id IS NULL;

  _safe_settings := _f.settings - 'capi_token';
  RETURN jsonb_build_object(
    'id', _f.id, 'slug', _f.slug, 'title', _f.title, 'template', _f.template,
    'primary_color', _f.primary_color, 'font_family', _f.font_family,
    'theme', _f.theme,
    'settings', _safe_settings,
    'seo_title', _f.seo_title, 'seo_description', _f.seo_description,
    'og_image_url', _f.og_image_url,
    'redirect_url', _f.redirect_url,
    'steps', _steps,
    'logic', _logic,
    'legacy_blocks', _legacy_blocks
  );
END $function$;

-- RPC para registrar progresso/respostas do lead durante o funil
CREATE OR REPLACE FUNCTION public.register_funnel_lead(
  _slug text,
  _name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _answers jsonb DEFAULT '{}'::jsonb,
  _utm jsonb DEFAULT '{}'::jsonb,
  _last_step_id uuid DEFAULT NULL,
  _completed boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _fid uuid; _lead_id uuid;
BEGIN
  SELECT id INTO _fid FROM public.traffic_funnels WHERE slug = _slug AND status='published';
  IF _fid IS NULL THEN RAISE EXCEPTION 'funnel not found or not published'; END IF;

  INSERT INTO public.traffic_leads (
    funnel_id, name, phone, email, answers, utm, last_step_id, completed_at
  ) VALUES (
    _fid,
    nullif(trim(coalesce(_name,'')), ''),
    nullif(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(_email,'')), ''),
    coalesce(_answers,'{}'::jsonb),
    coalesce(_utm,'{}'::jsonb),
    _last_step_id,
    CASE WHEN _completed THEN now() ELSE NULL END
  ) RETURNING id INTO _lead_id;

  RETURN _lead_id;
END $$;

REVOKE ALL ON FUNCTION public.register_funnel_lead(text,text,text,text,jsonb,jsonb,uuid,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.register_funnel_lead(text,text,text,text,jsonb,jsonb,uuid,boolean) TO anon, authenticated;
