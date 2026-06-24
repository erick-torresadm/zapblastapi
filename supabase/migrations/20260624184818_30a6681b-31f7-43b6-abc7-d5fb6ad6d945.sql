-- Store CRON_SECRET in Vault and re-schedule pg_cron jobs to use it (replacing the public anon key).
-- The CRON_SECRET value must match the env var of the same name read by the worker endpoints.

DO $$
DECLARE
  v_existing_id uuid;
  v_secret text := 'aNS--er4Vl4WPR1u9Del9bnkvcDCBz-vYa8hAhnJZGiqXiMsiWbAI4XiUqUnpSZc';
BEGIN
  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'cron_secret';
  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'cron_secret', 'Shared secret for /api/public/* worker endpoints');
  ELSE
    PERFORM vault.update_secret(v_existing_id, v_secret, 'cron_secret', 'Shared secret for /api/public/* worker endpoints');
  END IF;
END $$;

-- Helper: fetch CRON_SECRET from vault
CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;

-- Re-schedule admin-push-dispatch with CRON_SECRET in apikey header
DO $$
DECLARE
  v_headers jsonb;
BEGIN
  v_headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey', public._get_cron_secret()
  );

  BEGIN PERFORM cron.unschedule('admin-push-dispatch'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'admin-push-dispatch',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://zapblastapi.lovable.app/api/public/dispatch-admin-pushes',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $cmd$, v_headers)
  );

  BEGIN PERFORM cron.unschedule('group-launcher-tick-every-minute'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('group-launcher-tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'group-launcher-tick-every-minute',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://zapblastapi.lovable.app/api/public/group-launcher/tick',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $cmd$, v_headers)
  );
END $$;