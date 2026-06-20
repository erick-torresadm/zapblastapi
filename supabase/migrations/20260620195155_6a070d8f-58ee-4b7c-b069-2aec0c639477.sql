-- 1) coupon_redemptions: forbid direct INSERT by authenticated users.
DROP POLICY IF EXISTS "Users insert own redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "Users insert own coupon redemptions" ON public.coupon_redemptions;
REVOKE INSERT ON public.coupon_redemptions FROM authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;

-- 2) Agenda tables: restrict writes to owner or workspace admin; members keep SELECT.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'agenda_appointments',
    'agenda_availability',
    'agenda_blocks',
    'agenda_services',
    'agenda_professionals',
    'agenda_reengagement_campaigns'
  ];
  polname text;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR polname IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, tbl);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_insert" ON public.%1$I
      FOR INSERT TO authenticated
      WITH CHECK (
        owner_user_id = auth.uid()
        OR public.crm_is_workspace_admin(owner_user_id)
      );
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_update" ON public.%1$I
      FOR UPDATE TO authenticated
      USING (
        owner_user_id = auth.uid()
        OR public.crm_is_workspace_admin(owner_user_id)
      )
      WITH CHECK (
        owner_user_id = auth.uid()
        OR public.crm_is_workspace_admin(owner_user_id)
      );
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_delete" ON public.%1$I
      FOR DELETE TO authenticated
      USING (
        owner_user_id = auth.uid()
        OR public.crm_is_workspace_admin(owner_user_id)
      );
    $f$, tbl);
  END LOOP;
END$$;

-- 3) evolution_servers: revoke SELECT on api_key column from authenticated;
--    server code already reads via service_role.
REVOKE SELECT (api_key) ON public.evolution_servers FROM authenticated;