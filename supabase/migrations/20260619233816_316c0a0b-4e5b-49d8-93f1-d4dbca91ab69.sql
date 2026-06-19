CREATE TABLE public.maps_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'text',
  category TEXT,
  city TEXT,
  lat NUMERIC,
  lng NUMERIC,
  radius_m INTEGER,
  only_with_phone BOOLEAN NOT NULL DEFAULT true,
  whatsapp_check BOOLEAN NOT NULL DEFAULT false,
  leads_returned INTEGER NOT NULL DEFAULT 0,
  whatsapp_valid_count INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  refunded BOOLEAN NOT NULL DEFAULT false,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maps_searches TO authenticated;
GRANT ALL ON public.maps_searches TO service_role;

ALTER TABLE public.maps_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own maps searches"
  ON public.maps_searches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_maps_searches_user_created ON public.maps_searches(user_id, created_at DESC);