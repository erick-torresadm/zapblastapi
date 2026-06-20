-- Allow admins to read signup IP logs for abuse investigation
DROP POLICY IF EXISTS "Admins can read signup ip logs" ON public.signup_ip_log;
CREATE POLICY "Admins can read signup ip logs"
  ON public.signup_ip_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Restrict warmup_messages policy to authenticated role (was on public)
DROP POLICY IF EXISTS "Manage own warmup msgs" ON public.warmup_messages;
CREATE POLICY "Manage own warmup msgs"
  ON public.warmup_messages
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);