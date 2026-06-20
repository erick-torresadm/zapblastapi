
-- ============================================================================
-- Group Launcher: campaigns, links, create jobs + public rotator RPC
-- ============================================================================

-- 1) CAMPAIGNS
CREATE TABLE public.group_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  member_limit INTEGER NOT NULL DEFAULT 950 CHECK (member_limit BETWEEN 1 AND 1024),
  default_description TEXT,
  default_image_url TEXT,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_campaigns_owner ON public.group_campaigns(owner_user_id);
CREATE INDEX idx_group_campaigns_slug ON public.group_campaigns(slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_campaigns TO authenticated;
GRANT ALL ON public.group_campaigns TO service_role;

ALTER TABLE public.group_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages campaigns" ON public.group_campaigns
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- 2) LINKS
CREATE TABLE public.group_campaign_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('created','pasted')),
  group_jid TEXT,
  invite_code TEXT,
  invite_url TEXT,
  title TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','full','broken','archived')),
  filled_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gcl_campaign ON public.group_campaign_links(campaign_id, position);
CREATE INDEX idx_gcl_active ON public.group_campaign_links(campaign_id, position) WHERE status = 'active';
CREATE INDEX idx_gcl_monitor ON public.group_campaign_links(last_checked_at) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_campaign_links TO authenticated;
GRANT ALL ON public.group_campaign_links TO service_role;

ALTER TABLE public.group_campaign_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages links" ON public.group_campaign_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.group_campaigns c WHERE c.id = campaign_id AND c.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.group_campaigns c WHERE c.id = campaign_id AND c.owner_user_id = auth.uid())
  );

-- 3) CREATE JOBS (queue)
CREATE TABLE public.group_create_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  link_id UUID REFERENCES public.group_campaign_links(id) ON DELETE SET NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gcj_pending ON public.group_create_jobs(next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_gcj_campaign ON public.group_create_jobs(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_create_jobs TO authenticated;
GRANT ALL ON public.group_create_jobs TO service_role;

ALTER TABLE public.group_create_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages create jobs" ON public.group_create_jobs
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- 4) updated_at trigger reuse
CREATE TRIGGER trg_group_campaigns_updated BEFORE UPDATE ON public.group_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_group_campaign_links_updated BEFORE UPDATE ON public.group_campaign_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_group_create_jobs_updated BEFORE UPDATE ON public.group_create_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Public rotator RPC
CREATE OR REPLACE FUNCTION public.public_get_next_group_link(_slug TEXT)
RETURNS TABLE(invite_url TEXT, title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id UUID;
  v_member_limit INT;
  v_link RECORD;
BEGIN
  SELECT id, member_limit INTO v_campaign_id, v_member_limit
  FROM public.group_campaigns
  WHERE slug = _slug AND is_active = TRUE
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.group_campaigns
  SET click_count = click_count + 1
  WHERE id = v_campaign_id;

  -- pick first active link, prefer lowest position, lock to avoid races
  SELECT id, invite_url AS url, title AS ttl, member_count, invite_code
  INTO v_link
  FROM public.group_campaign_links
  WHERE campaign_id = v_campaign_id
    AND status = 'active'
    AND invite_url IS NOT NULL
  ORDER BY position ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_link.id IS NULL THEN
    RETURN;
  END IF;

  -- if at limit, mark full and try next
  IF v_link.member_count >= v_member_limit THEN
    UPDATE public.group_campaign_links
    SET status = 'full', filled_at = now()
    WHERE id = v_link.id;

    -- promote next pending to active
    UPDATE public.group_campaign_links
    SET status = 'active'
    WHERE id = (
      SELECT id FROM public.group_campaign_links
      WHERE campaign_id = v_campaign_id AND status = 'pending' AND invite_url IS NOT NULL
      ORDER BY position ASC, created_at ASC LIMIT 1
    );

    -- recurse-ish: fetch new active
    SELECT id, invite_url AS url, title AS ttl, member_count, invite_code
    INTO v_link
    FROM public.group_campaign_links
    WHERE campaign_id = v_campaign_id AND status = 'active' AND invite_url IS NOT NULL
    ORDER BY position ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_link.id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  UPDATE public.group_campaign_links
  SET click_count = click_count + 1
  WHERE id = v_link.id;

  invite_url := v_link.url;
  title := v_link.ttl;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_get_next_group_link(TEXT) TO anon, authenticated;
