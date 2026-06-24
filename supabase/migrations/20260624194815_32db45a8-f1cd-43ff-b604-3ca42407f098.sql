
-- =========================================
-- TWENTY CRM INTEGRATION
-- =========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Vault: chave de criptografia das api keys do Twenty (gerada uma vez)
DO $$
DECLARE v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'twenty_enc_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'base64'), 'twenty_enc_key', 'AES passphrase for twenty_connections.api_key_encrypted');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._twenty_enc_key()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, vault
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'twenty_enc_key' LIMIT 1; $$;
REVOKE ALL ON FUNCTION public._twenty_enc_key() FROM PUBLIC, anon, authenticated;

-- 2) twenty_connections
CREATE TABLE public.twenty_connections (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_url         text NOT NULL,
  api_key_encrypted bytea NOT NULL,
  workspace_id     text,
  enabled          boolean NOT NULL DEFAULT false,
  replace_inbox    boolean NOT NULL DEFAULT false,
  last_test_at     timestamptz,
  last_test_ok    boolean,
  last_test_error  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.twenty_connections TO authenticated;
GRANT ALL ON public.twenty_connections TO service_role;
ALTER TABLE public.twenty_connections ENABLE ROW LEVEL SECURITY;
-- usuários veem/manipulam só a própria conexão, e a chave criptografada nunca é lida via Data API direto (só pela RPC)
CREATE POLICY "own twenty_connections read" ON public.twenty_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own twenty_connections write" ON public.twenty_connections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) twenty_contact_map
CREATE TABLE public.twenty_contact_map (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164       text NOT NULL,
  twenty_person_id text NOT NULL,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_e164)
);
GRANT SELECT ON public.twenty_contact_map TO authenticated;
GRANT ALL ON public.twenty_contact_map TO service_role;
ALTER TABLE public.twenty_contact_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own twenty_contact_map read" ON public.twenty_contact_map FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4) twenty_sync_queue
CREATE TABLE public.twenty_sync_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_message_id  uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending', -- pending | done | failed
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_message_id)
);
CREATE INDEX twenty_sync_queue_pending_idx ON public.twenty_sync_queue (status, created_at) WHERE status = 'pending';
GRANT SELECT ON public.twenty_sync_queue TO authenticated;
GRANT ALL ON public.twenty_sync_queue TO service_role;
ALTER TABLE public.twenty_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own twenty_sync_queue read" ON public.twenty_sync_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5) twenty_deals_cache
CREATE TABLE public.twenty_deals_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  twenty_id        text NOT NULL,
  name             text,
  amount_micros    bigint,
  currency         text,
  stage            text,
  close_date       timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, twenty_id)
);
CREATE INDEX twenty_deals_cache_user_idx ON public.twenty_deals_cache (user_id);
GRANT SELECT ON public.twenty_deals_cache TO authenticated;
GRANT ALL ON public.twenty_deals_cache TO service_role;
ALTER TABLE public.twenty_deals_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own twenty_deals_cache read" ON public.twenty_deals_cache FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 6) RPC: salvar conexão (recebe api_key plain, devolve criptografado pra coluna)
CREATE OR REPLACE FUNCTION public.twenty_save_connection(
  _base_url text,
  _api_key text,
  _workspace_id text,
  _enabled boolean,
  _replace_inbox boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_enc bytea;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _base_url !~ '^https?://' THEN RAISE EXCEPTION 'invalid url'; END IF;

  IF _api_key IS NULL OR _api_key = '' THEN
    -- preserva chave existente
    UPDATE public.twenty_connections SET
      base_url = _base_url, workspace_id = _workspace_id,
      enabled = _enabled, replace_inbox = _replace_inbox, updated_at = now()
    WHERE user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'no existing connection — api key required'; END IF;
  ELSE
    v_enc := pgp_sym_encrypt(_api_key, public._twenty_enc_key());
    INSERT INTO public.twenty_connections (user_id, base_url, api_key_encrypted, workspace_id, enabled, replace_inbox)
    VALUES (auth.uid(), _base_url, v_enc, _workspace_id, _enabled, _replace_inbox)
    ON CONFLICT (user_id) DO UPDATE SET
      base_url = EXCLUDED.base_url,
      api_key_encrypted = EXCLUDED.api_key_encrypted,
      workspace_id = EXCLUDED.workspace_id,
      enabled = EXCLUDED.enabled,
      replace_inbox = EXCLUDED.replace_inbox,
      updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.twenty_save_connection(text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.twenty_save_connection(text,text,text,boolean,boolean) TO authenticated;

-- 7) RPC: ler api key descriptografada (apenas o próprio user, e service_role pelo worker)
CREATE OR REPLACE FUNCTION public.twenty_get_api_key(_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_enc bytea;
BEGIN
  IF _user_id IS NULL THEN _user_id := auth.uid(); END IF;
  -- só o dono pode obter pela autenticação normal; service_role bypassa SECURITY DEFINER porque já é dono total
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT api_key_encrypted INTO v_enc FROM public.twenty_connections WHERE user_id = _user_id;
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_enc, public._twenty_enc_key());
END $$;
REVOKE ALL ON FUNCTION public.twenty_get_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.twenty_get_api_key(uuid) TO authenticated, service_role;

-- 8) Trigger: enfileira mensagens de chat_messages se o user tem conexão habilitada
CREATE OR REPLACE FUNCTION public._twenty_enqueue_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.twenty_connections WHERE user_id = NEW.user_id AND enabled = true) THEN
    INSERT INTO public.twenty_sync_queue (user_id, chat_message_id)
    VALUES (NEW.user_id, NEW.id)
    ON CONFLICT (chat_message_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_messages_enqueue_twenty ON public.chat_messages;
CREATE TRIGGER chat_messages_enqueue_twenty
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public._twenty_enqueue_message();

-- 9) updated_at trigger reutilizado
CREATE OR REPLACE FUNCTION public._twenty_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER twenty_connections_touch BEFORE UPDATE ON public.twenty_connections
FOR EACH ROW EXECUTE FUNCTION public._twenty_touch_updated_at();
CREATE TRIGGER twenty_sync_queue_touch BEFORE UPDATE ON public.twenty_sync_queue
FOR EACH ROW EXECUTE FUNCTION public._twenty_touch_updated_at();

-- 10) pg_cron: dispara workers
DO $$
DECLARE v_headers jsonb;
BEGIN
  v_headers := jsonb_build_object('Content-Type','application/json','apikey', public._get_cron_secret());

  BEGIN PERFORM cron.unschedule('twenty-sync-messages'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'twenty-sync-messages',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://zapblastapi.lovable.app/api/public/twenty-sync',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $cmd$, v_headers)
  );

  BEGIN PERFORM cron.unschedule('twenty-deals-refresh'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'twenty-deals-refresh',
    '*/5 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://zapblastapi.lovable.app/api/public/twenty-deals-refresh',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $cmd$, v_headers)
  );
END $$;
