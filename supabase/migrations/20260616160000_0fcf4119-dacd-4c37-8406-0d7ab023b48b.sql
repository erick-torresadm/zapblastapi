
-- Tabela de log de IPs de cadastro
CREATE TABLE IF NOT EXISTS public.signup_ip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signup_ip_log_ip ON public.signup_ip_log(ip, created_at DESC);

GRANT SELECT, INSERT ON public.signup_ip_log TO authenticated;
GRANT ALL ON public.signup_ip_log TO service_role;
GRANT SELECT, INSERT ON public.signup_ip_log TO anon;

ALTER TABLE public.signup_ip_log ENABLE ROW LEVEL SECURITY;
-- Ninguém lê via API pública; service_role lida com tudo. Sem políticas = bloqueado para anon/auth.
CREATE POLICY "Service role only via API" ON public.signup_ip_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atualiza o trigger de novo usuário para criar trial Pro de 7 dias
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
    VALUES (NEW.id, _pro_id, 'trialing', now() + interval '7 days', now(), now() + interval '7 days')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
