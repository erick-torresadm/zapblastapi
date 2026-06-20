
REVOKE EXECUTE ON FUNCTION public.check_login_lockout(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_login_lockout(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb, text, text) TO authenticated, service_role;
