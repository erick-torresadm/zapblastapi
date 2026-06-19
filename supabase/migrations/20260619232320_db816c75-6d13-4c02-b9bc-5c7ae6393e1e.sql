
-- ============= ANTI-ABUSO DE TRIAL =============

-- 1) Blocklist unificada (uma linha por sinal queimado)
CREATE TABLE public.trial_abuse_blocklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('email_norm','phone','cpf','fingerprint','ip','ip_subnet','card_fp','asn')),
  value_hash TEXT NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trial_abuse_blocklist_kind_value_uq ON public.trial_abuse_blocklist (kind, value_hash);
CREATE INDEX trial_abuse_blocklist_expires_idx ON public.trial_abuse_blocklist (expires_at) WHERE expires_at IS NOT NULL;

GRANT SELECT ON public.trial_abuse_blocklist TO authenticated;
GRANT ALL ON public.trial_abuse_blocklist TO service_role;
ALTER TABLE public.trial_abuse_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read blocklist" ON public.trial_abuse_blocklist FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages blocklist" ON public.trial_abuse_blocklist FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 2) Log de device fingerprint por signup
CREATE TABLE public.signup_device_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint_hash TEXT,
  email_norm_hash TEXT,
  ip TEXT,
  ip_subnet TEXT,
  user_agent TEXT,
  asn TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signup_device_log_fp_idx ON public.signup_device_log (fingerprint_hash, created_at DESC);
CREATE INDEX signup_device_log_email_idx ON public.signup_device_log (email_norm_hash, created_at DESC);
CREATE INDEX signup_device_log_subnet_idx ON public.signup_device_log (ip_subnet, created_at DESC);
GRANT ALL ON public.signup_device_log TO service_role;
ALTER TABLE public.signup_device_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only signup_device_log" ON public.signup_device_log FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins read signup_device_log" ON public.signup_device_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) Domínios descartáveis (semente curta, dá pra crescer depois)
CREATE TABLE public.disposable_email_domains (
  domain TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.disposable_email_domains TO authenticated, anon;
GRANT ALL ON public.disposable_email_domains TO service_role;
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read disposable" ON public.disposable_email_domains FOR SELECT
  TO authenticated, anon USING (true);
CREATE POLICY "Service manages disposable" ON public.disposable_email_domains FOR ALL
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.disposable_email_domains (domain) VALUES
  ('mailinator.com'),('10minutemail.com'),('guerrillamail.com'),('guerrillamail.info'),
  ('tempmail.com'),('temp-mail.org'),('temp-mail.io'),('throwawaymail.com'),
  ('yopmail.com'),('getnada.com'),('maildrop.cc'),('sharklasers.com'),
  ('trashmail.com'),('fakeinbox.com'),('mailnesia.com'),('mintemail.com'),
  ('dispostable.com'),('inboxbear.com'),('moakt.com'),('emailondeck.com'),
  ('mohmal.com'),('mailcatch.com'),('mytrashmail.com'),('spambox.us'),
  ('mailtemp.info'),('tempinbox.com'),('mailbox52.ga'),('trbvm.com'),
  ('discard.email'),('33mail.com'),('anonbox.net'),('byom.de'),
  ('mailforspam.com'),('spam4.me'),('grr.la'),('einrot.com');

-- 4) Log de export de fluxos (rastrear watermark / origem)
CREATE TABLE public.flow_export_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id UUID,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fingerprint_hash TEXT
);
CREATE INDEX flow_export_log_user_idx ON public.flow_export_log (user_id, exported_at DESC);
GRANT SELECT, INSERT ON public.flow_export_log TO authenticated;
GRANT ALL ON public.flow_export_log TO service_role;
ALTER TABLE public.flow_export_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own export log" ON public.flow_export_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own export log" ON public.flow_export_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read export log" ON public.flow_export_log FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5) Adiciona colunas ao signup_ip_log para subnet e ASN (compat)
ALTER TABLE public.signup_ip_log
  ADD COLUMN IF NOT EXISTS ip_subnet TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS asn TEXT;
CREATE INDEX IF NOT EXISTS signup_ip_log_subnet_idx ON public.signup_ip_log (ip_subnet, created_at DESC);

-- 6) Função helper: normaliza e-mail (lowercase, strip +tag, strip dots no gmail)
CREATE OR REPLACE FUNCTION public.normalize_email(_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _local TEXT;
  _domain TEXT;
BEGIN
  IF _email IS NULL THEN RETURN NULL; END IF;
  _email := lower(trim(_email));
  _local := split_part(_email, '@', 1);
  _domain := split_part(_email, '@', 2);
  IF _domain IS NULL OR _domain = '' THEN RETURN _email; END IF;
  -- remove +tag
  _local := split_part(_local, '+', 1);
  -- gmail/googlemail: remove pontos e trata googlemail como gmail
  IF _domain IN ('gmail.com','googlemail.com') THEN
    _local := replace(_local, '.', '');
    _domain := 'gmail.com';
  END IF;
  RETURN _local || '@' || _domain;
END;
$$;
