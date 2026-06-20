DROP POLICY IF EXISTS "Authenticated can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can view all coupons" ON public.coupons;
CREATE POLICY "Admins can view all coupons"
  ON public.coupons
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can submit a lead to a published funnel" ON public.traffic_leads;
CREATE POLICY "Anyone can submit a lead to a published funnel"
  ON public.traffic_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.traffic_funnels f
      WHERE f.id = traffic_leads.funnel_id
        AND f.status = 'published'
    )
  );

GRANT INSERT ON public.traffic_leads TO anon;