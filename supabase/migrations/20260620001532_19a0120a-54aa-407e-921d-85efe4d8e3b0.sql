CREATE POLICY "crm-media: workspace update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'crm-media' AND public.crm_is_workspace_admin((storage.foldername(name))[1]::uuid))
  WITH CHECK (bucket_id = 'crm-media' AND public.crm_is_workspace_admin((storage.foldername(name))[1]::uuid));