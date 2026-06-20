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
    -- a) Mensagens onde remoteJidAlt == lid e remoteJid é número real
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

    -- b) Mensagens onde remoteJid == lid mas from_phone foi resolvido antes
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

    -- c) chat_messages com contact_jid == lid e telefone real ao lado
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

REVOKE ALL ON FUNCTION public.lookup_lid_phone(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_lid_phone(uuid, uuid, text) TO service_role;