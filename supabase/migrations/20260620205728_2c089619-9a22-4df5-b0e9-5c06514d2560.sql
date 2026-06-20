
CREATE OR REPLACE FUNCTION public.public_get_next_group_link(_slug text)
RETURNS TABLE(invite_url text, title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign_id UUID;
  v_member_limit INT;
  v_link_id UUID;
  v_link_url TEXT;
  v_link_title TEXT;
  v_link_members INT;
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

  SELECT l.id, l.invite_url, l.title, l.member_count
    INTO v_link_id, v_link_url, v_link_title, v_link_members
  FROM public.group_campaign_links l
  WHERE l.campaign_id = v_campaign_id
    AND l.status = 'active'
    AND l.invite_url IS NOT NULL
  ORDER BY l.position ASC, l.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_link_id IS NULL THEN
    RETURN;
  END IF;

  IF v_link_members >= v_member_limit THEN
    UPDATE public.group_campaign_links
    SET status = 'full', filled_at = now()
    WHERE id = v_link_id;

    UPDATE public.group_campaign_links
    SET status = 'active'
    WHERE id = (
      SELECT l2.id FROM public.group_campaign_links l2
      WHERE l2.campaign_id = v_campaign_id
        AND l2.status = 'pending'
        AND l2.invite_url IS NOT NULL
      ORDER BY l2.position ASC, l2.created_at ASC LIMIT 1
    );

    SELECT l.id, l.invite_url, l.title, l.member_count
      INTO v_link_id, v_link_url, v_link_title, v_link_members
    FROM public.group_campaign_links l
    WHERE l.campaign_id = v_campaign_id
      AND l.status = 'active'
      AND l.invite_url IS NOT NULL
    ORDER BY l.position ASC, l.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_link_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  UPDATE public.group_campaign_links
  SET click_count = click_count + 1
  WHERE id = v_link_id;

  invite_url := v_link_url;
  title := v_link_title;
  RETURN NEXT;
END;
$function$;
