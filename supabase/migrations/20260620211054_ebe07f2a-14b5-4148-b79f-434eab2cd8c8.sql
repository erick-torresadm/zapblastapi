
CREATE TABLE IF NOT EXISTS public.crm_lid_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  lid_jid text NOT NULL,
  phone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, lid_jid)
);

GRANT SELECT ON public.crm_lid_map TO authenticated;
GRANT ALL ON public.crm_lid_map TO service_role;

ALTER TABLE public.crm_lid_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can view lid map"
  ON public.crm_lid_map FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE INDEX IF NOT EXISTS idx_crm_lid_map_owner_lid ON public.crm_lid_map(owner_user_id, lid_jid);
CREATE INDEX IF NOT EXISTS idx_crm_lid_map_phone ON public.crm_lid_map(owner_user_id, phone);

-- Upsert helper (called by sync server fn)
CREATE OR REPLACE FUNCTION public.crm_upsert_lid_map(
  p_owner uuid,
  p_instance uuid,
  p_lid text,
  p_phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lid IS NULL OR p_phone IS NULL THEN RETURN; END IF;
  IF length(regexp_replace(p_phone, '\D', '', 'g')) NOT BETWEEN 8 AND 14 THEN RETURN; END IF;
  INSERT INTO public.crm_lid_map(owner_user_id, instance_id, lid_jid, phone)
  VALUES (p_owner, p_instance, p_lid, regexp_replace(p_phone, '\D', '', 'g'))
  ON CONFLICT (owner_user_id, lid_jid) DO UPDATE
    SET phone = EXCLUDED.phone,
        instance_id = COALESCE(EXCLUDED.instance_id, public.crm_lid_map.instance_id),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.crm_upsert_lid_map(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_upsert_lid_map(uuid, uuid, text, text) TO service_role;

-- Improved lookup: cache first
CREATE OR REPLACE FUNCTION public.lookup_lid_phone(
  p_user_id uuid,
  p_instance_id uuid,
  p_lid_jid text
) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    -- priority 0: cache from Evolution sync
    SELECT phone, updated_at AS received_at, 0 AS priority
    FROM public.crm_lid_map
    WHERE owner_user_id = p_user_id
      AND lid_jid = p_lid_jid

    UNION ALL

    SELECT
      regexp_replace(split_part(raw_payload #>> '{data,key,remoteJid}', '@', 1), '\D', '', 'g') AS phone,
      received_at,
      1 AS priority
    FROM public.incoming_messages
    WHERE user_id = p_user_id
      AND (p_instance_id IS NULL OR instance_id = p_instance_id)
      AND raw_payload #>> '{data,key,remoteJidAlt}' = p_lid_jid
      AND raw_payload #>> '{data,key,remoteJid}' LIKE '%@s.whatsapp.net'

    UNION ALL

    SELECT
      from_phone AS phone,
      received_at,
      2 AS priority
    FROM public.incoming_messages
    WHERE user_id = p_user_id
      AND (p_instance_id IS NULL OR instance_id = p_instance_id)
      AND raw_payload #>> '{data,key,remoteJid}' = p_lid_jid
      AND from_phone IS NOT NULL
      AND length(from_phone) BETWEEN 8 AND 14

    UNION ALL

    SELECT
      contact_phone AS phone,
      created_at AS received_at,
      3 AS priority
    FROM public.chat_messages
    WHERE user_id = p_user_id
      AND contact_jid = p_lid_jid
      AND contact_phone IS NOT NULL
      AND length(contact_phone) BETWEEN 8 AND 14
  )
  SELECT phone
  FROM candidates
  WHERE phone IS NOT NULL AND length(phone) BETWEEN 8 AND 14
  ORDER BY priority ASC, received_at DESC
  LIMIT 1
$$;

-- Apply resolution: walk pending @lid conversations and resolve them via cache
CREATE OR REPLACE FUNCTION public.crm_apply_lid_resolution(p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv RECORD;
  _phone text;
  _existing uuid;
  _resolved int := 0;
  _merged int := 0;
BEGIN
  FOR _conv IN
    SELECT id, contact_phone, contact_jid, instance_id
    FROM public.crm_conversations
    WHERE owner_user_id = p_owner
      AND (contact_jid LIKE '%@lid' OR contact_phone ~ '^[0-9]{15,}$')
  LOOP
    SELECT phone INTO _phone
    FROM public.crm_lid_map
    WHERE owner_user_id = p_owner
      AND lid_jid = COALESCE(_conv.contact_jid, _conv.contact_phone || '@lid')
    LIMIT 1;

    IF _phone IS NULL THEN CONTINUE; END IF;

    -- Check if there's another conversation already at the real phone
    SELECT id INTO _existing
    FROM public.crm_conversations
    WHERE owner_user_id = p_owner
      AND contact_phone = _phone
      AND id <> _conv.id
    LIMIT 1;

    IF _existing IS NOT NULL THEN
      PERFORM public.crm_merge_conversations(_conv.id, _existing);
      _merged := _merged + 1;
    ELSE
      UPDATE public.crm_conversations
      SET contact_phone = _phone,
          contact_jid = _phone || '@s.whatsapp.net',
          is_resolved = true,
          updated_at = now()
      WHERE id = _conv.id;
      _resolved := _resolved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('resolved', _resolved, 'merged', _merged);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_apply_lid_resolution(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_apply_lid_resolution(uuid) TO service_role;
