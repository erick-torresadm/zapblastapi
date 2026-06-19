-- chat_messages: mídia
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image','video','audio','document','sticker')),
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS media_size BIGINT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INT,
  ADD COLUMN IF NOT EXISTS is_ptt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quoted_text TEXT,
  ADD COLUMN IF NOT EXISTS reaction TEXT;

-- crm_conversations: perfil + presença + custom fields
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_about TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_company TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_message_type TEXT,
  ADD COLUMN IF NOT EXISTS presence TEXT,
  ADD COLUMN IF NOT EXISTS presence_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_synced_at TIMESTAMPTZ;

-- Atualiza trigger pra propagar tipo da última mensagem
CREATE OR REPLACE FUNCTION public.chat_messages_upsert_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _preview TEXT;
BEGIN
  _preview := COALESCE(
    NEW.text,
    NEW.caption,
    CASE NEW.media_type
      WHEN 'image' THEN '📷 Imagem'
      WHEN 'video' THEN '🎬 Vídeo'
      WHEN 'audio' THEN CASE WHEN NEW.is_ptt THEN '🎤 Mensagem de voz' ELSE '🎵 Áudio' END
      WHEN 'document' THEN '📎 ' || COALESCE(NEW.media_filename,'Documento')
      WHEN 'sticker' THEN '🎟️ Figurinha'
      ELSE NULL
    END
  );

  INSERT INTO public.crm_conversations (
    owner_user_id, instance_id, contact_phone, contact_jid, chat_type,
    last_message_at, last_message_text, last_message_direction, last_message_type,
    unread_count
  ) VALUES (
    NEW.user_id, NEW.instance_id, NEW.contact_phone, NEW.contact_jid, COALESCE(NEW.chat_type, 'user'),
    NEW.created_at, _preview, NEW.direction, NEW.media_type,
    CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END
  )
  ON CONFLICT (owner_user_id, contact_phone) DO UPDATE SET
    instance_id = COALESCE(EXCLUDED.instance_id, public.crm_conversations.instance_id),
    contact_jid = COALESCE(EXCLUDED.contact_jid, public.crm_conversations.contact_jid),
    chat_type = COALESCE(EXCLUDED.chat_type, public.crm_conversations.chat_type),
    last_message_at = EXCLUDED.last_message_at,
    last_message_text = EXCLUDED.last_message_text,
    last_message_direction = EXCLUDED.last_message_direction,
    last_message_type = EXCLUDED.last_message_type,
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
END; $function$;

-- crm_quick_replies (respostas rápidas)
CREATE TABLE IF NOT EXISTS public.crm_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, shortcut)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_quick_replies TO authenticated;
GRANT ALL ON public.crm_quick_replies TO service_role;

ALTER TABLE public.crm_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr: workspace read"
  ON public.crm_quick_replies FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "qr: admin write"
  ON public.crm_quick_replies FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "qr: admin update"
  ON public.crm_quick_replies FOR UPDATE TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id))
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "qr: admin delete"
  ON public.crm_quick_replies FOR DELETE TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id));

CREATE TRIGGER crm_qr_updated_at BEFORE UPDATE ON public.crm_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_conversations;
