
-- Garantir função de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 1. traffic_funnels: novos campos
ALTER TABLE public.traffic_funnels
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pixel_id text,
  ADD COLUMN IF NOT EXISTS pixel_token text,
  ADD COLUMN IF NOT EXISTS redirect_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 2. traffic_steps
CREATE TABLE IF NOT EXISTS public.traffic_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT 'Página',
  type text NOT NULL DEFAULT 'question',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_step_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_steps TO authenticated;
GRANT SELECT ON public.traffic_steps TO anon;
GRANT ALL ON public.traffic_steps TO service_role;
ALTER TABLE public.traffic_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage steps" ON public.traffic_steps;
CREATE POLICY "Owner manage steps" ON public.traffic_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Public read steps of published funnels" ON public.traffic_steps;
CREATE POLICY "Public read steps of published funnels" ON public.traffic_steps FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.status = 'published'));

CREATE INDEX IF NOT EXISTS idx_traffic_steps_funnel ON public.traffic_steps(funnel_id, position);

DROP TRIGGER IF EXISTS trg_traffic_steps_updated ON public.traffic_steps;
CREATE TRIGGER trg_traffic_steps_updated BEFORE UPDATE ON public.traffic_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. traffic_blocks
ALTER TABLE public.traffic_blocks
  ADD COLUMN IF NOT EXISTS step_id uuid REFERENCES public.traffic_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS field_key text;

CREATE INDEX IF NOT EXISTS idx_traffic_blocks_step ON public.traffic_blocks(step_id, position);

DROP POLICY IF EXISTS "Public read blocks of published funnels" ON public.traffic_blocks;
CREATE POLICY "Public read blocks of published funnels" ON public.traffic_blocks FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.status = 'published'));

-- 4. traffic_logic
CREATE TABLE IF NOT EXISTS public.traffic_logic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.traffic_funnels(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.traffic_steps(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.traffic_blocks(id) ON DELETE CASCADE,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_step_id uuid REFERENCES public.traffic_steps(id) ON DELETE CASCADE,
  redirect_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_logic TO authenticated;
GRANT SELECT ON public.traffic_logic TO anon;
GRANT ALL ON public.traffic_logic TO service_role;
ALTER TABLE public.traffic_logic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage logic" ON public.traffic_logic;
CREATE POLICY "Owner manage logic" ON public.traffic_logic FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "Public read logic of published funnels" ON public.traffic_logic;
CREATE POLICY "Public read logic of published funnels" ON public.traffic_logic FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.traffic_funnels f WHERE f.id = funnel_id AND f.status = 'published'));

CREATE INDEX IF NOT EXISTS idx_traffic_logic_step ON public.traffic_logic(step_id, position);

-- 5. traffic_leads
ALTER TABLE public.traffic_leads
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_step_id uuid REFERENCES public.traffic_steps(id) ON DELETE SET NULL;

-- 6. traffic_events
ALTER TABLE public.traffic_events
  ADD COLUMN IF NOT EXISTS step_id uuid REFERENCES public.traffic_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_traffic_events_funnel_step ON public.traffic_events(funnel_id, step_id, created_at DESC);

-- FK self-ref pra next_step_id (depois da criação da tabela)
ALTER TABLE public.traffic_steps
  DROP CONSTRAINT IF EXISTS traffic_steps_next_step_fk;
ALTER TABLE public.traffic_steps
  ADD CONSTRAINT traffic_steps_next_step_fk FOREIGN KEY (next_step_id)
  REFERENCES public.traffic_steps(id) ON DELETE SET NULL;
