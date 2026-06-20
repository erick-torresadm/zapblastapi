
-- Extensão para EXCLUDE com tstzrange
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Feature flag de plano
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS has_agenda BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- agenda_businesses
-- ============================================================
CREATE TABLE public.agenda_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  about TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  default_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  confirm_offsets_minutes INT[] NOT NULL DEFAULT ARRAY[1440, 120],
  notify_professional BOOLEAN NOT NULL DEFAULT true,
  primary_color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_businesses_owner_idx ON public.agenda_businesses(owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_businesses TO authenticated;
GRANT ALL ON public.agenda_businesses TO service_role;
ALTER TABLE public.agenda_businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read business" ON public.agenda_businesses FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));
CREATE POLICY "owner manage business" ON public.agenda_businesses FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER agenda_businesses_updated BEFORE UPDATE ON public.agenda_businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- agenda_professionals
-- ============================================================
CREATE TABLE public.agenda_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.agenda_businesses(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  color TEXT,
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_professionals_biz_idx ON public.agenda_professionals(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_professionals TO authenticated;
GRANT ALL ON public.agenda_professionals TO service_role;
ALTER TABLE public.agenda_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage professionals" ON public.agenda_professionals FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

CREATE TRIGGER agenda_professionals_updated BEFORE UPDATE ON public.agenda_professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- agenda_services
-- ============================================================
CREATE TABLE public.agenda_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.agenda_businesses(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_min INT NOT NULL DEFAULT 30,
  price_cents BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_services_biz_idx ON public.agenda_services(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_services TO authenticated;
GRANT ALL ON public.agenda_services TO service_role;
ALTER TABLE public.agenda_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage services" ON public.agenda_services FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

CREATE TRIGGER agenda_services_updated BEFORE UPDATE ON public.agenda_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- agenda_service_professionals (N×N)
-- ============================================================
CREATE TABLE public.agenda_service_professionals (
  service_id UUID NOT NULL REFERENCES public.agenda_services(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.agenda_professionals(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, professional_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_service_professionals TO authenticated;
GRANT ALL ON public.agenda_service_professionals TO service_role;
ALTER TABLE public.agenda_service_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage svc-pro" ON public.agenda_service_professionals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agenda_services s WHERE s.id = service_id AND public.crm_is_workspace_member(s.owner_user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agenda_services s WHERE s.id = service_id AND public.crm_is_workspace_member(s.owner_user_id)));

-- ============================================================
-- agenda_availability (janelas semanais)
-- ============================================================
CREATE TABLE public.agenda_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.agenda_professionals(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_availability_pro_idx ON public.agenda_availability(professional_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_availability TO authenticated;
GRANT ALL ON public.agenda_availability TO service_role;
ALTER TABLE public.agenda_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage availability" ON public.agenda_availability FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

-- ============================================================
-- agenda_blocks
-- ============================================================
CREATE TABLE public.agenda_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.agenda_professionals(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_blocks_pro_idx ON public.agenda_blocks(professional_id, starts_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_blocks TO authenticated;
GRANT ALL ON public.agenda_blocks TO service_role;
ALTER TABLE public.agenda_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage blocks" ON public.agenda_blocks FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

-- ============================================================
-- agenda_appointments
-- ============================================================
CREATE TABLE public.agenda_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.agenda_businesses(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.agenda_professionals(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.agenda_services(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_notes TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  confirm_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_via TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_appointments_status_chk CHECK (status IN ('pending','confirmed_customer','confirmed_pro','confirmed','cancelled','no_show','done')),
  CONSTRAINT agenda_appointments_time_chk CHECK (ends_at > starts_at),
  -- Anti overbooking por profissional (não conta cancelados)
  CONSTRAINT agenda_appointments_no_overlap EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled','no_show'))
);
CREATE INDEX agenda_appointments_biz_idx ON public.agenda_appointments(business_id, starts_at);
CREATE INDEX agenda_appointments_pro_idx ON public.agenda_appointments(professional_id, starts_at);
CREATE INDEX agenda_appointments_phone_idx ON public.agenda_appointments(owner_user_id, customer_phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_appointments TO authenticated;
GRANT ALL ON public.agenda_appointments TO service_role;
ALTER TABLE public.agenda_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage appointments" ON public.agenda_appointments FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

CREATE TRIGGER agenda_appointments_updated BEFORE UPDATE ON public.agenda_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- agenda_notifications (fila + log)
-- ============================================================
CREATE TABLE public.agenda_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.agenda_businesses(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.agenda_appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('booking_created','reminder','reengagement','manual')),
  target TEXT NOT NULL CHECK (target IN ('customer','professional')),
  phone TEXT NOT NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  message_text TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','replied_yes','replied_no','cancelled')),
  wa_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_notifications_queue_idx ON public.agenda_notifications(status, scheduled_at) WHERE status = 'queued';
CREATE INDEX agenda_notifications_appt_idx ON public.agenda_notifications(appointment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_notifications TO authenticated;
GRANT ALL ON public.agenda_notifications TO service_role;
ALTER TABLE public.agenda_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read notifications" ON public.agenda_notifications FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));
CREATE POLICY "owner write notifications" ON public.agenda_notifications FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

-- ============================================================
-- agenda_reengagement_campaigns
-- ============================================================
CREATE TABLE public.agenda_reengagement_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.agenda_businesses(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  coupon_code TEXT,
  inactive_days INT NOT NULL DEFAULT 30,
  service_ids UUID[],
  cadence TEXT NOT NULL DEFAULT 'every_30_days' CHECK (cadence IN ('every_7_days','every_15_days','every_30_days')),
  active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agenda_reengagement_biz_idx ON public.agenda_reengagement_campaigns(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_reengagement_campaigns TO authenticated;
GRANT ALL ON public.agenda_reengagement_campaigns TO service_role;
ALTER TABLE public.agenda_reengagement_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage reeng" ON public.agenda_reengagement_campaigns FOR ALL TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id))
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

CREATE TRIGGER agenda_reengagement_updated BEFORE UPDATE ON public.agenda_reengagement_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RPCs públicas (SECURITY DEFINER)
-- ============================================================

-- 1) Buscar negócio público pelo slug
CREATE OR REPLACE FUNCTION public.agenda_public_get_business(_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _biz RECORD;
  _services JSONB;
  _pros JSONB;
BEGIN
  SELECT id, name, about, timezone, primary_color, active
    INTO _biz FROM public.agenda_businesses
    WHERE slug = _slug AND active = true;
  IF _biz IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'description', s.description,
    'duration_min', s.duration_min, 'price_cents', s.price_cents,
    'professional_ids', COALESCE((SELECT array_agg(sp.professional_id) FROM public.agenda_service_professionals sp WHERE sp.service_id = s.id), ARRAY[]::uuid[])
  ) ORDER BY s.sort_order, s.name), '[]'::jsonb)
  INTO _services
  FROM public.agenda_services s
  WHERE s.business_id = _biz.id AND s.active = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'color', p.color, 'avatar_url', p.avatar_url
  ) ORDER BY p.name), '[]'::jsonb)
  INTO _pros
  FROM public.agenda_professionals p
  WHERE p.business_id = _biz.id AND p.active = true;

  RETURN jsonb_build_object(
    'found', true,
    'business', jsonb_build_object(
      'id', _biz.id, 'name', _biz.name, 'about', _biz.about,
      'timezone', _biz.timezone, 'primary_color', _biz.primary_color
    ),
    'services', _services,
    'professionals', _pros
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_get_business(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_get_business(TEXT) TO anon, authenticated;

-- 2) Calcular slots livres
CREATE OR REPLACE FUNCTION public.agenda_public_get_slots(
  _business_id UUID, _service_id UUID, _professional_id UUID, _date DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _svc RECORD;
  _pro RECORD;
  _biz RECORD;
  _tz TEXT;
  _slot_min INT;
  _result JSONB := '[]'::jsonb;
  _row RECORD;
  _cursor TIMESTAMPTZ;
  _slot_end TIMESTAMPTZ;
  _day_start TIMESTAMPTZ;
  _day_end TIMESTAMPTZ;
  _conflict BOOLEAN;
BEGIN
  SELECT * INTO _biz FROM public.agenda_businesses WHERE id = _business_id AND active = true;
  IF _biz IS NULL THEN RETURN _result; END IF;
  SELECT * INTO _svc FROM public.agenda_services WHERE id = _service_id AND active = true;
  IF _svc IS NULL THEN RETURN _result; END IF;
  SELECT * INTO _pro FROM public.agenda_professionals WHERE id = _professional_id AND active = true;
  IF _pro IS NULL THEN RETURN _result; END IF;

  _tz := COALESCE(_biz.timezone, 'America/Sao_Paulo');
  _slot_min := _svc.duration_min;

  -- itera janelas de availability do weekday
  FOR _row IN
    SELECT start_time, end_time FROM public.agenda_availability
    WHERE professional_id = _professional_id
      AND weekday = EXTRACT(DOW FROM _date)::SMALLINT
  LOOP
    _day_start := ((_date::TEXT || ' ' || _row.start_time::TEXT)::TIMESTAMP AT TIME ZONE _tz);
    _day_end := ((_date::TEXT || ' ' || _row.end_time::TEXT)::TIMESTAMP AT TIME ZONE _tz);
    _cursor := _day_start;
    WHILE _cursor + (_slot_min || ' minutes')::INTERVAL <= _day_end LOOP
      _slot_end := _cursor + (_slot_min || ' minutes')::INTERVAL;
      -- não permitir slots no passado
      IF _cursor > now() THEN
        SELECT EXISTS(
          SELECT 1 FROM public.agenda_appointments a
          WHERE a.professional_id = _professional_id
            AND a.status NOT IN ('cancelled','no_show')
            AND tstzrange(a.starts_at, a.ends_at) && tstzrange(_cursor, _slot_end)
          UNION ALL
          SELECT 1 FROM public.agenda_blocks b
          WHERE b.professional_id = _professional_id
            AND tstzrange(b.starts_at, b.ends_at) && tstzrange(_cursor, _slot_end)
        ) INTO _conflict;
        IF NOT _conflict THEN
          _result := _result || jsonb_build_array(jsonb_build_object(
            'starts_at', _cursor, 'ends_at', _slot_end
          ));
        END IF;
      END IF;
      _cursor := _cursor + (_slot_min || ' minutes')::INTERVAL;
    END LOOP;
  END LOOP;

  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_get_slots(UUID, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_get_slots(UUID, UUID, UUID, DATE) TO anon, authenticated;

-- 3) Reservar (book)
CREATE OR REPLACE FUNCTION public.agenda_public_book(
  _business_id UUID, _service_id UUID, _professional_id UUID,
  _starts_at TIMESTAMPTZ, _customer_name TEXT, _customer_phone TEXT, _customer_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _biz RECORD;
  _svc RECORD;
  _pro RECORD;
  _ends TIMESTAMPTZ;
  _appt_id UUID;
  _token UUID;
  _phone TEXT;
  _offset INT;
BEGIN
  IF length(coalesce(_customer_name,'')) < 2 OR length(coalesce(_customer_name,'')) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nome inválido');
  END IF;
  IF length(coalesce(_customer_phone,'')) < 8 OR length(coalesce(_customer_phone,'')) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Telefone inválido');
  END IF;

  SELECT * INTO _biz FROM public.agenda_businesses WHERE id = _business_id AND active = true;
  IF _biz IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Negócio indisponível'); END IF;
  SELECT * INTO _svc FROM public.agenda_services WHERE id = _service_id AND business_id = _business_id AND active = true;
  IF _svc IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Serviço indisponível'); END IF;
  SELECT * INTO _pro FROM public.agenda_professionals WHERE id = _professional_id AND business_id = _business_id AND active = true;
  IF _pro IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Profissional indisponível'); END IF;

  IF _starts_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Horário inválido');
  END IF;

  _ends := _starts_at + (_svc.duration_min || ' minutes')::INTERVAL;
  _phone := regexp_replace(_customer_phone, '\D', '', 'g');

  BEGIN
    INSERT INTO public.agenda_appointments (
      business_id, professional_id, service_id, owner_user_id,
      customer_name, customer_phone, customer_notes,
      starts_at, ends_at, status, created_via
    ) VALUES (
      _business_id, _professional_id, _service_id, _biz.owner_user_id,
      trim(_customer_name), _phone, _customer_notes,
      _starts_at, _ends, 'pending', 'public'
    ) RETURNING id, confirm_token INTO _appt_id, _token;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Horário ocupado, escolha outro');
  END;

  -- enfileira confirmação imediata pro cliente
  INSERT INTO public.agenda_notifications(owner_user_id, business_id, appointment_id, kind, target, phone, instance_id, scheduled_at)
  VALUES (_biz.owner_user_id, _business_id, _appt_id, 'booking_created', 'customer', _phone, _biz.default_instance_id, now());

  -- enfileira lembretes futuros conforme offsets
  FOREACH _offset IN ARRAY _biz.confirm_offsets_minutes LOOP
    IF _starts_at - (_offset || ' minutes')::INTERVAL > now() THEN
      INSERT INTO public.agenda_notifications(owner_user_id, business_id, appointment_id, kind, target, phone, instance_id, scheduled_at)
      VALUES (_biz.owner_user_id, _business_id, _appt_id, 'reminder', 'customer', _phone, _biz.default_instance_id,
              _starts_at - (_offset || ' minutes')::INTERVAL);
      -- notificar profissional também, se configurado e tiver telefone
      IF _biz.notify_professional AND _pro.phone IS NOT NULL AND length(_pro.phone) > 0 THEN
        INSERT INTO public.agenda_notifications(owner_user_id, business_id, appointment_id, kind, target, phone, instance_id, scheduled_at)
        VALUES (_biz.owner_user_id, _business_id, _appt_id, 'reminder', 'professional',
                regexp_replace(_pro.phone, '\D', '', 'g'), _biz.default_instance_id,
                _starts_at - (_offset || ' minutes')::INTERVAL);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'appointment_id', _appt_id, 'confirm_token', _token);
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_book(UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_book(UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 4) Confirmar / Cancelar por token
CREATE OR REPLACE FUNCTION public.agenda_public_get_by_token(_token UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r RECORD;
BEGIN
  SELECT a.id, a.starts_at, a.ends_at, a.status, a.customer_name, a.customer_phone,
         s.name AS service_name, s.duration_min,
         p.name AS professional_name,
         b.name AS business_name, b.slug AS business_slug
    INTO _r
    FROM public.agenda_appointments a
    JOIN public.agenda_services s ON s.id = a.service_id
    JOIN public.agenda_professionals p ON p.id = a.professional_id
    JOIN public.agenda_businesses b ON b.id = a.business_id
    WHERE a.confirm_token = _token;
  IF _r IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'appointment', to_jsonb(_r));
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_get_by_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_get_by_token(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.agenda_public_confirm(_token UUID, _by TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _appt RECORD;
  _new_status TEXT;
BEGIN
  SELECT * INTO _appt FROM public.agenda_appointments WHERE confirm_token = _token;
  IF _appt IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Agendamento não encontrado'); END IF;
  IF _appt.status IN ('cancelled','no_show','done') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Agendamento já finalizado');
  END IF;

  IF _by = 'customer' THEN
    _new_status := CASE WHEN _appt.status = 'confirmed_pro' THEN 'confirmed' ELSE 'confirmed_customer' END;
  ELSIF _by = 'professional' THEN
    _new_status := CASE WHEN _appt.status = 'confirmed_customer' THEN 'confirmed' ELSE 'confirmed_pro' END;
  ELSE
    _new_status := 'confirmed';
  END IF;

  UPDATE public.agenda_appointments SET status = _new_status, updated_at = now() WHERE id = _appt.id;
  RETURN jsonb_build_object('ok', true, 'status', _new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_confirm(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_confirm(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.agenda_public_cancel(_token UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _appt RECORD;
BEGIN
  SELECT * INTO _appt FROM public.agenda_appointments WHERE confirm_token = _token;
  IF _appt IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Agendamento não encontrado'); END IF;
  IF _appt.status IN ('cancelled','no_show','done') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Agendamento já finalizado');
  END IF;
  UPDATE public.agenda_appointments SET status = 'cancelled', updated_at = now() WHERE id = _appt.id;
  -- cancelar notificações pendentes
  UPDATE public.agenda_notifications SET status = 'cancelled' WHERE appointment_id = _appt.id AND status = 'queued';
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_public_cancel(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_public_cancel(UUID) TO anon, authenticated;
