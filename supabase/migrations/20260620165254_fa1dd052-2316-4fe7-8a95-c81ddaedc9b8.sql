
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resolve_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_resolve_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS label_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_avatar_path text;

UPDATE public.crm_conversations
SET is_resolved = false, next_resolve_at = now()
WHERE contact_phone IS NULL
   OR contact_phone !~ '^[0-9]{10,14}$'
   OR (contact_jid IS NOT NULL AND contact_jid LIKE '%@lid');

CREATE INDEX IF NOT EXISTS idx_crm_conv_pending_resolve
  ON public.crm_conversations(next_resolve_at)
  WHERE is_resolved = false;

CREATE INDEX IF NOT EXISTS idx_crm_conv_snoozed
  ON public.crm_conversations(owner_user_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conv_labels
  ON public.crm_conversations USING GIN(label_ids);

CREATE TABLE IF NOT EXISTS public.crm_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  color text NOT NULL DEFAULT '#3B82F6' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_labels TO authenticated;
GRANT ALL ON public.crm_labels TO service_role;

ALTER TABLE public.crm_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view labels"
  ON public.crm_labels FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "Workspace admins can manage labels"
  ON public.crm_labels FOR ALL TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id))
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id));

CREATE TRIGGER crm_labels_set_updated_at
  BEFORE UPDATE ON public.crm_labels
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE OR REPLACE FUNCTION public.crm_merge_conversations(_src_id uuid, _dst_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src RECORD;
  _dst RECORD;
BEGIN
  IF _src_id = _dst_id THEN
    RETURN jsonb_build_object('ok', false, 'message', 'src = dst');
  END IF;

  SELECT * INTO _src FROM public.crm_conversations WHERE id = _src_id FOR UPDATE;
  SELECT * INTO _dst FROM public.crm_conversations WHERE id = _dst_id FOR UPDATE;
  IF _src IS NULL OR _dst IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'conversa nao encontrada');
  END IF;
  IF _src.owner_user_id <> _dst.owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'message', 'owners diferentes');
  END IF;

  UPDATE public.chat_messages
    SET contact_phone = _dst.contact_phone,
        contact_jid = COALESCE(_dst.contact_jid, contact_jid)
    WHERE user_id = _src.owner_user_id
      AND contact_phone = _src.contact_phone;

  UPDATE public.crm_notes SET conversation_id = _dst_id WHERE conversation_id = _src_id;

  UPDATE public.crm_conversations dst
    SET unread_count = dst.unread_count + _src.unread_count,
        pinned_at = COALESCE(dst.pinned_at, _src.pinned_at),
        contact_name = COALESCE(NULLIF(dst.contact_name, ''), _src.contact_name),
        contact_avatar_url = COALESCE(dst.contact_avatar_url, _src.contact_avatar_url),
        contact_avatar_path = COALESCE(dst.contact_avatar_path, _src.contact_avatar_path),
        contact_about = COALESCE(dst.contact_about, _src.contact_about),
        last_message_at = GREATEST(dst.last_message_at, _src.last_message_at),
        updated_at = now()
    WHERE id = _dst_id;

  DELETE FROM public.crm_conversations WHERE id = _src_id;

  RETURN jsonb_build_object('ok', true, 'merged_into', _dst_id);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_merge_conversations(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_merge_conversations(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.chat_messages_upsert_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _preview TEXT;
  _is_resolved BOOLEAN;
BEGIN
  _preview := COALESCE(
    NEW.text, NEW.caption,
    CASE NEW.media_type
      WHEN 'image' THEN '📷 Imagem'
      WHEN 'video' THEN '🎬 Vídeo'
      WHEN 'audio' THEN CASE WHEN NEW.is_ptt THEN '🎤 Mensagem de voz' ELSE '🎵 Áudio' END
      WHEN 'document' THEN '📎 ' || COALESCE(NEW.media_filename,'Documento')
      WHEN 'sticker' THEN '🎟️ Figurinha'
      ELSE NULL
    END
  );

  _is_resolved := NEW.contact_phone ~ '^[0-9]{10,14}$'
                  AND (NEW.contact_jid IS NULL OR NEW.contact_jid NOT LIKE '%@lid');

  INSERT INTO public.crm_conversations (
    owner_user_id, instance_id, contact_phone, contact_jid, chat_type,
    last_message_at, last_message_text, last_message_direction, last_message_type,
    unread_count, is_resolved, next_resolve_at
  ) VALUES (
    NEW.user_id, NEW.instance_id, NEW.contact_phone, NEW.contact_jid, COALESCE(NEW.chat_type, 'user'),
    NEW.created_at, _preview, NEW.direction, NEW.media_type,
    CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END,
    _is_resolved,
    CASE WHEN _is_resolved THEN NULL ELSE now() END
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
    END;

  RETURN NEW;
END;
$$;
