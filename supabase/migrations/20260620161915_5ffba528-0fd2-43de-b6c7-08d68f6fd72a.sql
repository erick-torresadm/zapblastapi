
CREATE OR REPLACE FUNCTION public.submit_traffic_lead(
  _slug text, _name text, _phone text, _email text, _extra jsonb, _utm jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f public.traffic_funnels; _lid uuid;
BEGIN
  SELECT * INTO _f FROM public.traffic_funnels WHERE slug = _slug AND status = 'published';
  IF _f.id IS NULL THEN RAISE EXCEPTION 'funnel not found'; END IF;
  INSERT INTO public.traffic_leads (funnel_id, name, phone, email, extra, utm, pushed_to_list_id)
  VALUES (_f.id, _name, _phone, _email, coalesce(_extra,'{}'::jsonb), _utm, _f.default_list_id)
  RETURNING id INTO _lid;

  IF _f.default_list_id IS NOT NULL AND _phone IS NOT NULL THEN
    BEGIN
      INSERT INTO public.contacts (list_id, phone, name, user_id)
      VALUES (_f.default_list_id, _phone, _name, _f.owner_user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN _lid;
END $$;
