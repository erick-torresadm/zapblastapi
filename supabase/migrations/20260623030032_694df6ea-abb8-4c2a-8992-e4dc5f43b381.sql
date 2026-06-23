
-- push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own push subs" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- admin_push_events
CREATE TABLE IF NOT EXISTS public.admin_push_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS admin_push_events_created_idx ON public.admin_push_events(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_push_events_pending_idx ON public.admin_push_events(pushed_at) WHERE pushed_at IS NULL;
GRANT SELECT, UPDATE ON public.admin_push_events TO authenticated;
GRANT ALL ON public.admin_push_events TO service_role;
ALTER TABLE public.admin_push_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read events" ON public.admin_push_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update events" ON public.admin_push_events
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- helper: emite evento admin
CREATE OR REPLACE FUNCTION public.emit_admin_event(_type TEXT, _title TEXT, _body TEXT, _url TEXT DEFAULT NULL, _meta JSONB DEFAULT '{}'::jsonb)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.admin_push_events(type, title, body, url, meta)
  VALUES (_type, _title, _body, _url, COALESCE(_meta,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- trigger em subscriptions: trial novo, pagamento, bloqueio
CREATE OR REPLACE FUNCTION public.tg_subscription_admin_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email TEXT;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = NEW.user_id;
  IF TG_OP = 'INSERT' AND NEW.status = 'trialing' THEN
    PERFORM public.emit_admin_event(
      'trial_started',
      'Novo trial iniciado',
      COALESCE(_email,'usuário') || ' começou um trial.',
      '/app/admin/users',
      jsonb_build_object('user_id', NEW.user_id, 'email', _email)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'active' THEN
      PERFORM public.emit_admin_event(
        'payment_approved',
        'Pagamento aprovado',
        COALESCE(_email,'usuário') || ' ativou plano pago.',
        '/app/admin/users',
        jsonb_build_object('user_id', NEW.user_id, 'email', _email)
      );
    ELSIF NEW.status IN ('canceled','past_due','incomplete_expired') THEN
      PERFORM public.emit_admin_event(
        'plan_blocked',
        'Plano bloqueado',
        COALESCE(_email,'usuário') || ' teve plano bloqueado (' || NEW.status || ').',
        '/app/admin/users',
        jsonb_build_object('user_id', NEW.user_id, 'email', _email, 'status', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_admin_events ON public.subscriptions;
CREATE TRIGGER subscription_admin_events
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_admin_events();

-- agenda dispatcher de push a cada minuto
DO $$ BEGIN PERFORM cron.unschedule('admin-push-dispatch'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'admin-push-dispatch',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zapblastapi.lovable.app/api/public/dispatch-admin-pushes',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
