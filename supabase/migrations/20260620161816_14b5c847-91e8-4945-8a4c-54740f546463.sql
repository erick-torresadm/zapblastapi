
-- ============== TRAFFIC MODULE ==============

CREATE TABLE public.traffic_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Novo funil',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  template text NOT NULL DEFAULT 'funnel' CHECK (template IN ('funnel','linkbio')),
  primary_color text NOT NULL DEFAULT '#22c55e',
  font_family text NOT NULL DEFAULT 'Inter',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_list_id uuid,
  custom_domain text UNIQUE,
  seo_title text,
  seo_description text,
  og_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_funnels TO authenticated;
GRANT ALL ON public.traffic_funnels TO service_role;
ALTER TABLE public.traffic_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnels_owner_all" ON public.traffic_funnels
  FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE INDEX traffic_funnels_owner_idx ON public.traffic_funnels(owner_user_id);

CREATE TABLE public.traffic_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  type text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_blocks TO authenticated;
GRANT ALL ON public.traffic_blocks TO service_role;
ALTER TABLE public.traffic_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_owner_all" ON public.traffic_blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));
CREATE INDEX traffic_blocks_funnel_pos_idx ON public.traffic_blocks(funnel_id, position);

CREATE TABLE public.traffic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_id text,
  anonymous_id text,
  fbp text,
  fbc text,
  ip_hash text,
  ua text,
  referrer text,
  page_url text,
  utm jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  capi_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.traffic_events TO authenticated;
GRANT ALL ON public.traffic_events TO service_role;
ALTER TABLE public.traffic_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_owner_select" ON public.traffic_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));
CREATE INDEX traffic_events_funnel_created_idx ON public.traffic_events(funnel_id, created_at DESC);

CREATE TABLE public.traffic_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  utm jsonb,
  pushed_to_list_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.traffic_leads TO authenticated;
GRANT ALL ON public.traffic_leads TO service_role;
ALTER TABLE public.traffic_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_owner_select" ON public.traffic_leads
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));
CREATE INDEX traffic_leads_funnel_created_idx ON public.traffic_leads(funnel_id, created_at DESC);

CREATE TABLE public.traffic_custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  host text NOT NULL UNIQUE,
  verify_token text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  dns_ok boolean NOT NULL DEFAULT false,
  ssl_ok boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_custom_domains TO authenticated;
GRANT ALL ON public.traffic_custom_domains TO service_role;
ALTER TABLE public.traffic_custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domains_owner_all" ON public.traffic_custom_domains
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.traffic_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_traffic_funnels_updated BEFORE UPDATE ON public.traffic_funnels
  FOR EACH ROW EXECUTE FUNCTION public.traffic_touch_updated_at();
CREATE TRIGGER trg_traffic_blocks_updated BEFORE UPDATE ON public.traffic_blocks
  FOR EACH ROW EXECUTE FUNCTION public.traffic_touch_updated_at();

-- ============== PUBLIC RPCs ==============

-- Returns funnel + blocks (safe columns only) for public rendering. Strips CAPI token.
CREATE OR REPLACE FUNCTION public.get_published_funnel_by_slug(_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f public.traffic_funnels; _blocks jsonb; _safe_settings jsonb;
BEGIN
  SELECT * INTO _f FROM public.traffic_funnels WHERE slug = _slug AND status = 'published';
  IF _f.id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position,'type',type,'props',props) ORDER BY position), '[]'::jsonb)
    INTO _blocks FROM public.traffic_blocks WHERE funnel_id = _f.id;
  _safe_settings := _f.settings - 'capi_token';
  RETURN jsonb_build_object(
    'id', _f.id, 'slug', _f.slug, 'title', _f.title, 'template', _f.template,
    'primary_color', _f.primary_color, 'font_family', _f.font_family,
    'settings', _safe_settings, 'seo_title', _f.seo_title,
    'seo_description', _f.seo_description, 'og_image_url', _f.og_image_url,
    'blocks', _blocks
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_published_funnel_by_slug(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_published_funnel_by_host(_host text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slug text;
BEGIN
  SELECT f.slug INTO _slug
  FROM public.traffic_custom_domains d
  JOIN public.traffic_funnels f ON f.id = d.funnel_id
  WHERE d.host = _host AND d.dns_ok = true AND f.status = 'published'
  LIMIT 1;
  IF _slug IS NULL THEN RETURN NULL; END IF;
  RETURN public.get_published_funnel_by_slug(_slug);
END $$;
GRANT EXECUTE ON FUNCTION public.get_published_funnel_by_host(text) TO anon, authenticated;

-- Log event (anonymous, rate-limited soft via app layer)
CREATE OR REPLACE FUNCTION public.log_traffic_event(
  _slug text, _event_name text, _event_id text, _anonymous_id text,
  _fbp text, _fbc text, _ip_hash text, _ua text, _referrer text,
  _page_url text, _utm jsonb, _payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _fid uuid; _eid uuid;
BEGIN
  SELECT id INTO _fid FROM public.traffic_funnels WHERE slug = _slug AND status = 'published';
  IF _fid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.traffic_events (funnel_id, event_name, event_id, anonymous_id, fbp, fbc, ip_hash, ua, referrer, page_url, utm, payload)
  VALUES (_fid, _event_name, _event_id, _anonymous_id, _fbp, _fbc, _ip_hash, _ua, _referrer, _page_url, _utm, coalesce(_payload, '{}'::jsonb))
  RETURNING id INTO _eid;
  RETURN _eid;
END $$;
GRANT EXECUTE ON FUNCTION public.log_traffic_event(text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) TO anon, authenticated;

-- Submit lead (anonymous)
CREATE OR REPLACE FUNCTION public.submit_traffic_lead(
  _slug text, _name text, _phone text, _email text, _extra jsonb, _utm jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f public.traffic_funnels; _lid uuid; _contact_id uuid;
BEGIN
  SELECT * INTO _f FROM public.traffic_funnels WHERE slug = _slug AND status = 'published';
  IF _f.id IS NULL THEN RAISE EXCEPTION 'funnel not found'; END IF;
  INSERT INTO public.traffic_leads (funnel_id, name, phone, email, extra, utm, pushed_to_list_id)
  VALUES (_f.id, _name, _phone, _email, coalesce(_extra,'{}'::jsonb), _utm, _f.default_list_id)
  RETURNING id INTO _lid;

  -- push to contact list if configured and table exists
  IF _f.default_list_id IS NOT NULL AND _phone IS NOT NULL THEN
    BEGIN
      INSERT INTO public.contacts (list_id, phone, name, owner_user_id)
      VALUES (_f.default_list_id, _phone, _name, _f.owner_user_id);
    EXCEPTION WHEN OTHERS THEN
      -- ignore (column mismatch or duplicate); lead is already saved
      NULL;
    END;
  END IF;

  RETURN _lid;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_traffic_lead(text,text,text,text,jsonb,jsonb) TO anon, authenticated;

-- Verify domain by token (server-side called)
CREATE OR REPLACE FUNCTION public.mark_traffic_domain_verified(_host text, _token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean := false;
BEGIN
  UPDATE public.traffic_custom_domains
  SET dns_ok = true, last_checked_at = now()
  WHERE host = _host AND verify_token = _token;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  -- mirror to funnel.custom_domain
  UPDATE public.traffic_funnels f
  SET custom_domain = _host
  FROM public.traffic_custom_domains d
  WHERE d.host = _host AND d.verify_token = _token AND d.funnel_id = f.id;
  RETURN _ok;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_traffic_domain_verified(text,text) TO authenticated, service_role;
