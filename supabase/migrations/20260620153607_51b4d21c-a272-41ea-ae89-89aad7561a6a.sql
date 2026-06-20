
CREATE TABLE public.crm_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent','viewer')),
  display_name TEXT,
  max_uses INT,
  uses INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_links_token ON public.crm_invite_links(token);
CREATE INDEX idx_invite_links_owner ON public.crm_invite_links(owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_invite_links TO authenticated;
GRANT ALL ON public.crm_invite_links TO service_role;

ALTER TABLE public.crm_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins view invite links"
  ON public.crm_invite_links FOR SELECT TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "Workspace admins create invite links"
  ON public.crm_invite_links FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_workspace_admin(owner_user_id) AND created_by = auth.uid());

CREATE POLICY "Workspace admins update invite links"
  ON public.crm_invite_links FOR UPDATE TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id));

CREATE POLICY "Workspace admins delete invite links"
  ON public.crm_invite_links FOR DELETE TO authenticated
  USING (public.crm_is_workspace_admin(owner_user_id));

CREATE TRIGGER crm_invite_links_updated_at
  BEFORE UPDATE ON public.crm_invite_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Função para aceitar convite (usuário autenticado)
CREATE OR REPLACE FUNCTION public.accept_invite_link(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user UUID := auth.uid();
  _inv RECORD;
  _user_meta RECORD;
BEGIN
  IF _user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Faça login primeiro');
  END IF;

  SELECT * INTO _inv FROM public.crm_invite_links WHERE token = _token AND active = true;
  IF _inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Link inválido ou desativado');
  END IF;

  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Link expirado');
  END IF;

  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Link esgotado');
  END IF;

  -- Auto-convite (próprio owner)
  IF _inv.owner_user_id = _user THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você é o dono — não precisa entrar via convite');
  END IF;

  -- Pega nome do usuário (do profile)
  SELECT full_name INTO _user_meta FROM public.profiles WHERE id = _user;

  -- Cria/ativa agent na workspace
  INSERT INTO public.crm_agents(owner_user_id, agent_user_id, role, display_name, active)
  VALUES (_inv.owner_user_id, _user, _inv.role,
          COALESCE(_user_meta.full_name, 'Agente'), true)
  ON CONFLICT (owner_user_id, agent_user_id) DO UPDATE SET
    role = EXCLUDED.role,
    active = true,
    updated_at = now();

  UPDATE public.crm_invite_links SET uses = uses + 1 WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'owner_user_id', _inv.owner_user_id, 'role', _inv.role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite_link(TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_invite_link(TEXT) FROM PUBLIC;

-- Função pública para ver info básica do convite (sem revelar nada sensível)
CREATE OR REPLACE FUNCTION public.preview_invite_link(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _owner_name TEXT;
BEGIN
  SELECT i.*, p.full_name AS owner_name INTO _inv
    FROM public.crm_invite_links i
    LEFT JOIN public.profiles p ON p.id = i.owner_user_id
    WHERE i.token = _token AND i.active = true;

  IF _inv IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Link inválido');
  END IF;

  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Link expirado');
  END IF;

  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Link esgotado');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'role', _inv.role,
    'owner_name', _inv.owner_name,
    'display_name', _inv.display_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite_link(TEXT) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.preview_invite_link(TEXT) FROM PUBLIC;
