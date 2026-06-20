
-- 1) Restrict EFI provider plan IDs from public/anon access (column-level)
REVOKE SELECT (efi_plan_id_sandbox, efi_plan_id_prod) ON public.subscription_plans FROM anon, authenticated;
GRANT SELECT (efi_plan_id_sandbox, efi_plan_id_prod) ON public.subscription_plans TO service_role;

-- 2) Explicit DELETE policy for chat_messages (workspace admins or message author)
CREATE POLICY "chat: admins or author delete"
  ON public.chat_messages FOR DELETE
  USING (
    crm_is_workspace_admin(user_id)
    OR sent_by_agent_id = auth.uid()
    OR user_id = auth.uid()
  );

-- 3) Explicit UPDATE policy for crm_notes (author or workspace admin)
CREATE POLICY "notes: authors or admins update"
  ON public.crm_notes FOR UPDATE
  USING (author_user_id = auth.uid() OR crm_is_workspace_admin(owner_user_id))
  WITH CHECK (author_user_id = auth.uid() OR crm_is_workspace_admin(owner_user_id));
