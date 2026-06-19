-- Política: a pasta da workspace é o user_id do dono. Caminho: <owner_user_id>/<conversation_id>/<arquivo>
CREATE POLICY "crm-media: workspace read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crm-media' AND public.crm_is_workspace_member((storage.foldername(name))[1]::uuid));

CREATE POLICY "crm-media: workspace upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-media' AND public.crm_is_workspace_member((storage.foldername(name))[1]::uuid));

CREATE POLICY "crm-media: workspace delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'crm-media' AND public.crm_is_workspace_admin((storage.foldername(name))[1]::uuid));
