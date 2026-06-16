DROP POLICY IF EXISTS "Users view own campaign messages" ON public.campaign_messages;
CREATE POLICY "Users manage own campaign messages" ON public.campaign_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);