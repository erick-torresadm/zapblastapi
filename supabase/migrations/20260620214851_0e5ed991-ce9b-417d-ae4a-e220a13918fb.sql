
-- 1) Revoke read on sensitive Evolution columns from authenticated role
REVOKE SELECT (api_key, webhook_token) ON public.evolution_servers FROM authenticated;
REVOKE SELECT (api_key, webhook_token) ON public.evolution_servers FROM anon;

-- 2) Storage policies for crm-avatars bucket (mirror crm-media pattern)
CREATE POLICY "crm-avatars: workspace read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'crm-avatars' AND crm_is_workspace_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY "crm-avatars: workspace upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'crm-avatars' AND crm_is_workspace_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY "crm-avatars: workspace update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'crm-avatars' AND crm_is_workspace_admin(((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'crm-avatars' AND crm_is_workspace_admin(((storage.foldername(name))[1])::uuid));

CREATE POLICY "crm-avatars: workspace delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'crm-avatars' AND crm_is_workspace_admin(((storage.foldername(name))[1])::uuid));
