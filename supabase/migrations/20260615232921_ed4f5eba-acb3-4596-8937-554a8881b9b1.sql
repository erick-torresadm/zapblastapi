
ALTER TABLE public.evolution_servers ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users manage own servers" ON public.evolution_servers;

CREATE POLICY "Users select own servers" ON public.evolution_servers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own non-shared" ON public.evolution_servers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND is_shared = false);

CREATE POLICY "Users update own non-shared" ON public.evolution_servers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_shared = false)
  WITH CHECK (auth.uid() = user_id AND is_shared = false);

CREATE POLICY "Users delete own non-shared" ON public.evolution_servers
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND is_shared = false);

CREATE POLICY "Admins manage all servers" ON public.evolution_servers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
