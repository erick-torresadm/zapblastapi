
-- =========================================
-- CRM: equipe (agents) + conversas + notas
-- =========================================

CREATE TABLE IF NOT EXISTS public.crm_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent')),
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, agent_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_agents TO authenticated;
GRANT ALL ON public.crm_agents TO service_role;
ALTER TABLE public.crm_agents ENABLE ROW LEVEL SECURITY;

-- helper: o caller é dono ou admin da workspace?
CREATE OR REPLACE FUNCTION public.crm_is_workspace_admin(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_agents
    WHERE owner_user_id = _owner
      AND agent_user_id = auth.uid()
      AND active = true
      AND role IN ('owner','admin')
  ) OR _owner = auth.uid();
$$;

-- helper: o caller é membro ativo (qualquer role) da workspace?
CREATE OR REPLACE FUNCTION public.crm_is_workspace_member(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_agents
    WHERE owner_user_id = _owner
      AND agent_user_id = auth.uid()
      AND active = true
  ) OR _owner = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.crm_is_workspace_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_is_workspace_member(uuid) FROM anon;

-- Policies crm_agents
CREATE POLICY "agents: workspace members can view" ON public.crm_agents
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR agent_user_id = auth.uid()
         OR public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "agents: only owner/admin can write" ON public.crm_agents
  FOR ALL TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id))
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id));

-- ===== Conversations =====
CREATE TABLE IF NOT EXISTS public.crm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_phone text NOT NULL,
  contact_name text,
  assigned_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_text text,
  last_message_direction text,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, contact_phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_conversations TO authenticated;
GRANT ALL ON public.crm_conversations TO service_role;
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;

-- Atendente vê: dele OU sem dono (e precisa ser membro da workspace)
-- Dono/admin vê tudo da workspace
CREATE POLICY "convs: visibility by role" ON public.crm_conversations
  FOR SELECT TO authenticated
  USING (
    public.crm_is_workspace_admin(owner_user_id)
    OR (
      public.crm_is_workspace_member(owner_user_id)
      AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL)
    )
  );

CREATE POLICY "convs: members can write own/queue" ON public.crm_conversations
  FOR UPDATE TO authenticated
  USING (
    public.crm_is_workspace_admin(owner_user_id)
    OR (public.crm_is_workspace_member(owner_user_id)
        AND (assigned_agent_id = auth.uid() OR assigned_agent_id IS NULL))
  )
  WITH CHECK (
    public.crm_is_workspace_admin(owner_user_id)
    OR public.crm_is_workspace_member(owner_user_id)
  );

CREATE POLICY "convs: admin can insert" ON public.crm_conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "convs: admin can delete" ON public.crm_conversations
  FOR DELETE TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id));

CREATE INDEX IF NOT EXISTS crm_conversations_owner_status_idx
  ON public.crm_conversations (owner_user_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS crm_conversations_assigned_idx
  ON public.crm_conversations (assigned_agent_id, last_message_at DESC);

-- ===== Internal notes =====
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notes TO authenticated;
GRANT ALL ON public.crm_notes TO service_role;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes: workspace members read" ON public.crm_notes
  FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "notes: workspace members write own" ON public.crm_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.crm_is_workspace_member(owner_user_id) AND author_user_id = auth.uid()
  );

CREATE POLICY "notes: authors can update/delete own" ON public.crm_notes
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.crm_is_workspace_admin(owner_user_id));

CREATE INDEX IF NOT EXISTS crm_notes_conv_idx ON public.crm_notes (conversation_id, created_at DESC);

-- ===== chat_messages: quem enviou =====
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS sent_by_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Atualiza RLS de chat_messages: equipe pode ler conforme visibilidade da conversa
DROP POLICY IF EXISTS "Users manage own chat messages" ON public.chat_messages;

CREATE POLICY "chat: workspace visibility" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    public.crm_is_workspace_admin(user_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_conversations c
      WHERE c.owner_user_id = chat_messages.user_id
        AND c.contact_phone = chat_messages.contact_phone
        AND (c.assigned_agent_id = auth.uid() OR c.assigned_agent_id IS NULL)
        AND public.crm_is_workspace_member(c.owner_user_id)
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "chat: workspace members insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_workspace_member(user_id));

CREATE POLICY "chat: workspace members update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (public.crm_is_workspace_member(user_id))
  WITH CHECK (public.crm_is_workspace_member(user_id));

-- ===== Backfill: cria registro de owner em crm_agents para todo usuário existente que ainda não tem
INSERT INTO public.crm_agents (owner_user_id, agent_user_id, role, display_name, active)
SELECT u.id, u.id, 'owner', COALESCE(p.full_name, u.email), true
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (owner_user_id, agent_user_id) DO NOTHING;

-- Backfill: cria conversa pra cada chat_messages já existente
INSERT INTO public.crm_conversations (owner_user_id, instance_id, contact_phone, last_message_at, last_message_text, last_message_direction)
SELECT
  cm.user_id,
  (ARRAY_AGG(cm.instance_id ORDER BY cm.created_at DESC))[1],
  cm.contact_phone,
  MAX(cm.created_at),
  (ARRAY_AGG(cm.text ORDER BY cm.created_at DESC))[1],
  (ARRAY_AGG(cm.direction ORDER BY cm.created_at DESC))[1]
FROM public.chat_messages cm
GROUP BY cm.user_id, cm.contact_phone
ON CONFLICT (owner_user_id, contact_phone) DO NOTHING;

-- Trigger: ao criar/atualizar usuário, cria registro 'owner' automático em crm_agents
CREATE OR REPLACE FUNCTION public.handle_new_user_crm_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.crm_agents (owner_user_id, agent_user_id, role, display_name, active)
  VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), true)
  ON CONFLICT (owner_user_id, agent_user_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_crm_agent ON auth.users;
CREATE TRIGGER on_auth_user_created_crm_agent
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_crm_agent();

-- Trigger no chat_messages: upsert na conversa + unread/last_message
CREATE OR REPLACE FUNCTION public.chat_messages_upsert_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.crm_conversations (
    owner_user_id, instance_id, contact_phone,
    last_message_at, last_message_text, last_message_direction,
    unread_count
  ) VALUES (
    NEW.user_id, NEW.instance_id, NEW.contact_phone,
    NEW.created_at, NEW.text, NEW.direction,
    CASE WHEN NEW.direction = 'in' THEN 1 ELSE 0 END
  )
  ON CONFLICT (owner_user_id, contact_phone) DO UPDATE SET
    instance_id = COALESCE(EXCLUDED.instance_id, public.crm_conversations.instance_id),
    last_message_at = EXCLUDED.last_message_at,
    last_message_text = EXCLUDED.last_message_text,
    last_message_direction = EXCLUDED.last_message_direction,
    unread_count = CASE
      WHEN NEW.direction = 'in' THEN public.crm_conversations.unread_count + 1
      ELSE public.crm_conversations.unread_count
    END,
    -- Reabre se estava resolvida e veio mensagem nova de entrada
    status = CASE
      WHEN NEW.direction = 'in' AND public.crm_conversations.status = 'resolved'
        THEN 'open' ELSE public.crm_conversations.status
    END,
    updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS chat_messages_upsert_conv ON public.chat_messages;
CREATE TRIGGER chat_messages_upsert_conv
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_upsert_conversation();

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS crm_conv_updated_at ON public.crm_conversations;
CREATE TRIGGER crm_conv_updated_at
  BEFORE UPDATE ON public.crm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
