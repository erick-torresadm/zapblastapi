
-- ============ FLOWS ============
CREATE TABLE public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Novo fluxo',
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','keyword','new_contact','list_added','api')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  current_version_id uuid,
  draft_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flows TO authenticated;
GRANT ALL ON public.flows TO service_role;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own flows" ON public.flows
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_flows_updated BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FLOW VERSIONS ============
CREATE TABLE public.flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_versions TO authenticated;
GRANT ALL ON public.flow_versions TO service_role;
ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own flow versions" ON public.flow_versions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.flows
  ADD CONSTRAINT flows_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.flow_versions(id) ON DELETE SET NULL;

-- ============ FLOW RUNS ============
CREATE TABLE public.flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.flow_versions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_phone text NOT NULL,
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','waiting','done','failed','stopped')),
  current_node_id text,
  wait_until timestamptz,
  waiting_for text, -- 'input' | 'delay'
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flow_runs_worker ON public.flow_runs (status, wait_until) WHERE status IN ('running','waiting');
CREATE INDEX idx_flow_runs_inbound ON public.flow_runs (instance_id, contact_phone, status) WHERE status = 'waiting';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_runs TO authenticated;
GRANT ALL ON public.flow_runs TO service_role;
ALTER TABLE public.flow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own flow runs" ON public.flow_runs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_flow_runs_updated BEFORE UPDATE ON public.flow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FLOW RUN STEPS ============
CREATE TABLE public.flow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.flow_runs(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','error','skipped')),
  output jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flow_run_steps_metrics ON public.flow_run_steps (flow_id, node_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_run_steps TO authenticated;
GRANT ALL ON public.flow_run_steps TO service_role;
ALTER TABLE public.flow_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own flow run steps" ON public.flow_run_steps
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
