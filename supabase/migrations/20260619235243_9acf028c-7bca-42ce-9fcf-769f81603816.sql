ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_conv_owner_pinned_last
  ON public.crm_conversations (owner_user_id, pinned_at DESC NULLS LAST, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_conv_owner_archived
  ON public.crm_conversations (owner_user_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_starred
  ON public.chat_messages (user_id, contact_phone, starred)
  WHERE starred = true;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;