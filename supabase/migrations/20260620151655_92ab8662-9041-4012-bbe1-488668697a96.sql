
-- ============ login_attempts ============
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  ip TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (lower(email), created_at DESC);
CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts (ip, created_at DESC);

GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read login_attempts" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ admin_audit_log ============
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  payload JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_actor_time ON public.admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX idx_admin_audit_action_time ON public.admin_audit_log (action, created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read admin_audit_log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ security_events ============
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info | warning | critical
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_events_time ON public.security_events (created_at DESC);
CREATE INDEX idx_security_events_type_time ON public.security_events (event_type, created_at DESC);
CREATE INDEX idx_security_events_severity_time ON public.security_events (severity, created_at DESC);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read security_events" ON public.security_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ rate limit / lockout function ============
-- Retorna jsonb: { allowed: bool, reason: text, retry_after_seconds: int, fail_count: int }
CREATE OR REPLACE FUNCTION public.check_login_lockout(_email TEXT, _ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email_fails INT;
  _ip_fails INT;
  _last_fail TIMESTAMPTZ;
  _wait_seconds INT := 0;
BEGIN
  -- conta falhas nos últimos 60 minutos
  SELECT COUNT(*), MAX(created_at) INTO _email_fails, _last_fail
  FROM public.login_attempts
  WHERE lower(email) = lower(COALESCE(_email,''))
    AND success = false
    AND created_at > now() - interval '1 hour';

  SELECT COUNT(*) INTO _ip_fails
  FROM public.login_attempts
  WHERE ip = COALESCE(_ip,'')
    AND success = false
    AND created_at > now() - interval '1 hour';

  -- Lockout progressivo por e-mail
  IF _email_fails >= 10 THEN
    _wait_seconds := GREATEST(0, 3600 - EXTRACT(EPOCH FROM (now() - _last_fail))::INT);
    IF _wait_seconds > 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_attempts_email_1h',
        'retry_after_seconds', _wait_seconds, 'fail_count', _email_fails);
    END IF;
  ELSIF _email_fails >= 5 THEN
    _wait_seconds := GREATEST(0, 300 - EXTRACT(EPOCH FROM (now() - _last_fail))::INT);
    IF _wait_seconds > 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_attempts_email_5min',
        'retry_after_seconds', _wait_seconds, 'fail_count', _email_fails);
    END IF;
  ELSIF _email_fails >= 3 THEN
    _wait_seconds := GREATEST(0, 30 - EXTRACT(EPOCH FROM (now() - _last_fail))::INT);
    IF _wait_seconds > 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_attempts_email_30s',
        'retry_after_seconds', _wait_seconds, 'fail_count', _email_fails);
    END IF;
  END IF;

  -- Lockout por IP (mais permissivo, mas trava flood)
  IF _ip_fails >= 30 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_attempts_ip',
      'retry_after_seconds', 3600, 'fail_count', _ip_fails);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'fail_count', _email_fails);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(_email TEXT, _ip TEXT, _success BOOLEAN, _user_agent TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip, success, user_agent)
  VALUES (_email, _ip, _success, _user_agent);

  IF NOT _success THEN
    INSERT INTO public.security_events (event_type, severity, ip, user_agent, metadata)
    VALUES ('login_failed', 'warning', _ip, _user_agent, jsonb_build_object('email', _email));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _actor UUID, _action TEXT, _target_type TEXT, _target_id TEXT,
  _payload JSONB, _ip TEXT, _user_agent TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.admin_audit_log (actor_user_id, action, target_type, target_id, payload, ip, user_agent)
  VALUES (_actor, _action, _target_type, _target_id, _payload, _ip, _user_agent)
  RETURNING id INTO _id;

  INSERT INTO public.security_events (event_type, severity, user_id, ip, user_agent, metadata)
  VALUES ('admin_action', 'info', _actor, _ip, _user_agent,
    jsonb_build_object('action', _action, 'target_type', _target_type, 'target_id', _target_id));

  RETURN _id;
END;
$$;
