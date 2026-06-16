-- 1) Adiciona JID e tipo
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS contact_jid text,
  ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'user';

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS contact_jid text,
  ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'user';

-- 2) Atualiza o trigger para propagar jid/type
CREATE OR REPLACE FUNCTION public.chat_messages_upsert_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_conversations (
    owner_user_id, instance_id, contact_phone, contact_jid, chat_type,
    last_message_at, last_message_text, last_message_direction,
    unread_count
  ) VALUES (
    NEW.user_id, NEW.instance_id, NEW.contact_phone, NEW.contact_jid, COALESCE(NEW.chat_type, 'user'),
    NEW.created_at, NEW.text, NEW.direction,
    CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END
  )
  ON CONFLICT (owner_user_id, contact_phone) DO UPDATE SET
    instance_id = COALESCE(EXCLUDED.instance_id, public.crm_conversations.instance_id),
    contact_jid = COALESCE(EXCLUDED.contact_jid, public.crm_conversations.contact_jid),
    chat_type = COALESCE(EXCLUDED.chat_type, public.crm_conversations.chat_type),
    last_message_at = EXCLUDED.last_message_at,
    last_message_text = EXCLUDED.last_message_text,
    last_message_direction = EXCLUDED.last_message_direction,
    unread_count = CASE
      WHEN NEW.direction = 'in' THEN public.crm_conversations.unread_count + 1
      ELSE public.crm_conversations.unread_count
    END,
    status = CASE
      WHEN NEW.direction = 'in' AND public.crm_conversations.status = 'resolved'
        THEN 'open' ELSE public.crm_conversations.status
    END,
    updated_at = now();
  RETURN NEW;
END; $$;

-- 3) Remove conversas inválidas (grupos, LID, broadcasts) já criadas
DELETE FROM public.crm_conversations
 WHERE chat_type <> 'user'
    OR contact_phone ~ '^[0-9]{15,}$' -- IDs longos (LID/grupo)
    OR contact_phone = 'status';

DELETE FROM public.chat_messages
 WHERE chat_type <> 'user'
    OR contact_phone ~ '^[0-9]{15,}$'
    OR contact_phone = 'status';