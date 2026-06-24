
-- 1) chatwoot_connections (1 por user)
CREATE TABLE public.chatwoot_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chatwoot_account_id INTEGER NOT NULL,
  chatwoot_user_id INTEGER NOT NULL,
  email_used TEXT NOT NULL,
  user_access_token_encrypted TEXT NOT NULL,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  replace_inbox BOOLEAN NOT NULL DEFAULT false,
  last_test_ok BOOLEAN,
  last_test_at TIMESTAMPTZ,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatwoot_connections TO authenticated;
GRANT ALL ON public.chatwoot_connections TO service_role;

ALTER TABLE public.chatwoot_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own chatwoot conn" ON public.chatwoot_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own chatwoot conn" ON public.chatwoot_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own chatwoot conn" ON public.chatwoot_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete own chatwoot conn" ON public.chatwoot_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2) chatwoot_inbox_map: 1 inbox por instância WhatsApp do user
CREATE TABLE public.chatwoot_inbox_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  chatwoot_inbox_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, instance_id)
);

CREATE INDEX idx_chatwoot_inbox_user ON public.chatwoot_inbox_map(user_id);

GRANT SELECT ON public.chatwoot_inbox_map TO authenticated;
GRANT ALL ON public.chatwoot_inbox_map TO service_role;

ALTER TABLE public.chatwoot_inbox_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own inbox map" ON public.chatwoot_inbox_map
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3) chatwoot_contact_map: dedup phone → contato/conversa
CREATE TABLE public.chatwoot_contact_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  chatwoot_contact_id INTEGER NOT NULL,
  chatwoot_conversation_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_e164)
);

CREATE INDEX idx_chatwoot_contact_user ON public.chatwoot_contact_map(user_id);

GRANT SELECT ON public.chatwoot_contact_map TO authenticated;
GRANT ALL ON public.chatwoot_contact_map TO service_role;

ALTER TABLE public.chatwoot_contact_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own contact map" ON public.chatwoot_contact_map
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4) chatwoot_sync_queue: fila de outbound WhatsApp→Chatwoot
CREATE TABLE public.chatwoot_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_message_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_chatwoot_queue_status ON public.chatwoot_sync_queue(status, created_at)
  WHERE status IN ('pending','failed');
CREATE INDEX idx_chatwoot_queue_user ON public.chatwoot_sync_queue(user_id);

GRANT SELECT ON public.chatwoot_sync_queue TO authenticated;
GRANT ALL ON public.chatwoot_sync_queue TO service_role;

ALTER TABLE public.chatwoot_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own sync queue" ON public.chatwoot_sync_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5) Marca origem no chat_messages pra evitar eco
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS from_chatwoot BOOLEAN NOT NULL DEFAULT false;

-- 6) Trigger: enfileira mensagem nova pra Chatwoot (se conn enabled e não for eco)
CREATE OR REPLACE FUNCTION public.enqueue_chatwoot_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- ignora mensagens vindas do próprio Chatwoot (loop)
  IF NEW.from_chatwoot THEN RETURN NEW; END IF;

  SELECT enabled INTO v_enabled
  FROM public.chatwoot_connections
  WHERE user_id = NEW.user_id;

  IF v_enabled IS NOT TRUE THEN RETURN NEW; END IF;

  INSERT INTO public.chatwoot_sync_queue (user_id, chat_message_id)
  VALUES (NEW.user_id, NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_chatwoot_sync ON public.chat_messages;
CREATE TRIGGER trg_enqueue_chatwoot_sync
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_chatwoot_sync();

-- 7) Função utilitária: pega lote da fila atomicamente
CREATE OR REPLACE FUNCTION public.consume_chatwoot_queue(_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  chat_message_id UUID,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT q.id
    FROM public.chatwoot_sync_queue q
    WHERE q.status IN ('pending','failed') AND q.attempts < 5
    ORDER BY q.created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.chatwoot_sync_queue q
  SET status = 'processing', attempts = q.attempts + 1
  FROM cte
  WHERE q.id = cte.id
  RETURNING q.id, q.user_id, q.chat_message_id, q.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_chatwoot_queue(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_chatwoot_queue(INTEGER) TO service_role;

-- 8) updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_chatwoot_set_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_chatwoot_conn_updated ON public.chatwoot_connections;
CREATE TRIGGER trg_chatwoot_conn_updated
  BEFORE UPDATE ON public.chatwoot_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatwoot_set_updated();
