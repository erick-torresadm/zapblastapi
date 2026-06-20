
-- 1. evolution_servers: revoke column-level SELECT on sensitive columns for authenticated
REVOKE SELECT (api_key, webhook_token) ON public.evolution_servers FROM authenticated;
REVOKE SELECT (api_key, webhook_token) ON public.evolution_servers FROM anon;

-- 2. coupon_redemptions: restrict INSERT to service_role only
DROP POLICY IF EXISTS "Service role inserts redemptions" ON public.coupon_redemptions;
CREATE POLICY "Service role inserts redemptions"
ON public.coupon_redemptions
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. agenda_service_professionals: split member SELECT from admin/owner write
DROP POLICY IF EXISTS "members manage svc-pro" ON public.agenda_service_professionals;

CREATE POLICY "members select svc-pro"
ON public.agenda_service_professionals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agenda_services s
    WHERE s.id = agenda_service_professionals.service_id
      AND (s.owner_user_id = auth.uid() OR public.crm_is_workspace_member(s.owner_user_id))
  )
);

CREATE POLICY "admins manage svc-pro"
ON public.agenda_service_professionals
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agenda_services s
    WHERE s.id = agenda_service_professionals.service_id
      AND (s.owner_user_id = auth.uid() OR public.crm_is_workspace_admin(s.owner_user_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agenda_services s
    WHERE s.id = agenda_service_professionals.service_id
      AND (s.owner_user_id = auth.uid() OR public.crm_is_workspace_admin(s.owner_user_id))
  )
);
