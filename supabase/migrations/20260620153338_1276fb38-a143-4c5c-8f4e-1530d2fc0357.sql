
CREATE TABLE public.crm_contacts_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  push_name TEXT,
  verified_name TEXT,
  saved_name TEXT,
  profile_pic_url TEXT,
  profile_pic_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, contact_phone)
);

CREATE INDEX idx_ccp_owner_phone ON public.crm_contacts_profile(owner_user_id, contact_phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts_profile TO authenticated;
GRANT ALL ON public.crm_contacts_profile TO service_role;

ALTER TABLE public.crm_contacts_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can view contact profiles"
  ON public.crm_contacts_profile FOR SELECT TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "Workspace can upsert contact profiles"
  ON public.crm_contacts_profile FOR INSERT TO authenticated
  WITH CHECK (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "Workspace can update contact profiles"
  ON public.crm_contacts_profile FOR UPDATE TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "Workspace can delete contact profiles"
  ON public.crm_contacts_profile FOR DELETE TO authenticated
  USING (public.crm_is_workspace_member(owner_user_id));

CREATE TRIGGER ccp_updated_at
  BEFORE UPDATE ON public.crm_contacts_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- Trigger: capturar pushName + resolver @lid em chat_messages
-- ============================================
CREATE OR REPLACE FUNCTION public.chat_messages_resolve_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resolved TEXT;
  _push_name TEXT;
BEGIN
  -- Captura pushName do payload bruto se disponível (em incoming_messages relacionada)
  IF NEW.direction = 'in' AND NEW.contact_phone IS NOT NULL THEN
    SELECT raw_payload #>> '{data,pushName}'
      INTO _push_name
      FROM public.incoming_messages
      WHERE user_id = NEW.user_id
        AND raw_payload #>> '{data,key,id}' = NEW.wa_message_id
      LIMIT 1;

    IF _push_name IS NOT NULL AND length(_push_name) > 0 AND length(_push_name) < 200 THEN
      INSERT INTO public.crm_contacts_profile(owner_user_id, instance_id, contact_phone, push_name)
      VALUES (NEW.user_id, NEW.instance_id, NEW.contact_phone, _push_name)
      ON CONFLICT (owner_user_id, contact_phone) DO UPDATE
        SET push_name = EXCLUDED.push_name,
            instance_id = COALESCE(EXCLUDED.instance_id, public.crm_contacts_profile.instance_id),
            updated_at = now();
    END IF;
  END IF;

  -- Resolve @lid → telefone real
  IF NEW.contact_jid LIKE '%@lid' OR (NEW.contact_phone IS NOT NULL AND NEW.contact_phone ~ '^[0-9]{15,}$') THEN
    _resolved := public.lookup_lid_phone(NEW.user_id, NEW.instance_id, COALESCE(NEW.contact_jid, NEW.contact_phone || '@lid'));
    IF _resolved IS NOT NULL AND _resolved <> NEW.contact_phone THEN
      NEW.contact_phone := _resolved;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_resolve_contact_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_resolve_contact_trg
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_resolve_contact();
