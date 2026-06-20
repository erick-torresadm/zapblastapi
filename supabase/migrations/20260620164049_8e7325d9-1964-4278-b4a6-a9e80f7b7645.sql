-- Revoga SELECT da coluna sensível api_key para usuários do cliente.
-- service_role (server functions / admin) continua com acesso total.
REVOKE SELECT (api_key) ON public.evolution_servers FROM authenticated;
REVOKE SELECT (api_key) ON public.evolution_servers FROM anon;

-- Garante service_role com acesso pleno (idempotente)
GRANT ALL ON public.evolution_servers TO service_role;