
CREATE TABLE public.flow_keyword_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  match_mode TEXT NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('exact','contains','starts_with')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fkt_user_active ON public.flow_keyword_triggers(user_id, active);
CREATE INDEX idx_fkt_instance ON public.flow_keyword_triggers(instance_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_keyword_triggers TO authenticated;
GRANT ALL ON public.flow_keyword_triggers TO service_role;

ALTER TABLE public.flow_keyword_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own keyword triggers"
  ON public.flow_keyword_triggers FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_fkt_updated
  BEFORE UPDATE ON public.flow_keyword_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
