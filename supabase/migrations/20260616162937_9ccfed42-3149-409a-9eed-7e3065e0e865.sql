ALTER TABLE public.flow_runs DROP CONSTRAINT IF EXISTS flow_runs_status_check;
ALTER TABLE public.flow_runs ADD CONSTRAINT flow_runs_status_check
  CHECK (status = ANY (ARRAY['pending'::text,'running'::text,'waiting'::text,'done'::text,'failed'::text,'stopped'::text]));