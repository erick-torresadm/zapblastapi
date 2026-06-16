
ALTER TABLE public.contacts ALTER COLUMN list_id DROP NOT NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS name text;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  text text,
  evolution_message_id text,
  status text NOT NULL DEFAULT 'sent',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_messages_user_phone_idx ON public.chat_messages(user_id, contact_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON public.chat_messages(user_id, created_at DESC);
