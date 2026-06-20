ALTER TABLE public.flow_keyword_triggers
  ADD COLUMN IF NOT EXISTS per_contact_cooldown_seconds integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.flow_keyword_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NULL REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  contact_phone text NULL,
  contact_jid text NULL,
  remote_jid text NULL,
  resolution_status text NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  text_excerpt text NULL,
  triggers_evaluated integer NOT NULL DEFAULT 0,
  triggers_matched integer NOT NULL DEFAULT 0,
  matched_trigger_ids uuid[] NOT NULL DEFAULT '{}',
  matched_flow_ids uuid[] NOT NULL DEFAULT '{}',
  run_ids uuid[] NOT NULL DEFAULT '{}',
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.flow_keyword_audit TO authenticated;
GRANT ALL ON public.flow_keyword_audit TO service_role;

ALTER TABLE public.flow_keyword_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own keyword audit" ON public.flow_keyword_audit;
CREATE POLICY "Users can view own keyword audit"
ON public.flow_keyword_audit
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_flow_keyword_audit_user_created
ON public.flow_keyword_audit (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_keyword_audit_instance_created
ON public.flow_keyword_audit (instance_id, created_at DESC);