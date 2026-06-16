
-- 1) Storage policies for campaign-media bucket (private bucket, owner-scoped)
DROP POLICY IF EXISTS "campaign_media_select_own" ON storage.objects;
DROP POLICY IF EXISTS "campaign_media_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "campaign_media_update_own" ON storage.objects;
DROP POLICY IF EXISTS "campaign_media_delete_own" ON storage.objects;

CREATE POLICY "campaign_media_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "campaign_media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "campaign_media_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "campaign_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) chip_catalog: restrict to authenticated users only
DROP POLICY IF EXISTS "Catalog public to authed" ON public.chip_catalog;
CREATE POLICY "Catalog readable by authenticated"
  ON public.chip_catalog
  FOR SELECT
  TO authenticated
  USING (active = true);

REVOKE SELECT ON public.chip_catalog FROM anon;

-- 3) warmup_messages: restrict to authenticated only
DROP POLICY IF EXISTS "Read globals or own" ON public.warmup_messages;
CREATE POLICY "Read globals or own"
  ON public.warmup_messages
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

-- 4) user_roles: explicitly deny self-service writes (no INSERT/UPDATE/DELETE for users)
-- Only service_role (used by handle_new_user trigger and admin server fns) can write.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

-- Add explicit deny policies so RLS makes intent unambiguous
DROP POLICY IF EXISTS "Block role inserts by users" ON public.user_roles;
DROP POLICY IF EXISTS "Block role updates by users" ON public.user_roles;
DROP POLICY IF EXISTS "Block role deletes by users" ON public.user_roles;

CREATE POLICY "Block role inserts by users"
  ON public.user_roles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Block role updates by users"
  ON public.user_roles
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Block role deletes by users"
  ON public.user_roles
  FOR DELETE
  TO authenticated, anon
  USING (false);
