-- Fix: agenda tables had no GRANTs to authenticated/service_role and missing SELECT policies.
-- Without these, every Data API call (insert/select/update/delete) is rejected — surfaces as
-- "permission denied" or, on insert with RETURNING, as the RLS message reported by the user.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda_businesses','agenda_professionals','agenda_services','agenda_service_professionals',
    'agenda_availability','agenda_blocks','agenda_appointments','agenda_notifications',
    'agenda_reengagement_campaigns'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Missing SELECT policies for workspace members
CREATE POLICY "members read professionals" ON public.agenda_professionals
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "members read services" ON public.agenda_services
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "members read availability" ON public.agenda_availability
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "members read blocks" ON public.agenda_blocks
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "members read appointments" ON public.agenda_appointments
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));

CREATE POLICY "members read reengagement" ON public.agenda_reengagement_campaigns
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.crm_is_workspace_member(owner_user_id));
