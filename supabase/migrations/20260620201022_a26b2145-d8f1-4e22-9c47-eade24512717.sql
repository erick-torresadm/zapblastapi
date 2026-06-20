-- Schedule the group-launcher tick worker (every minute)
-- Processes pending group_create_jobs and monitors active group capacity
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('group-launcher-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'group-launcher-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zapblastapi.lovable.app/api/public/group-launcher/tick',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5YWJ0cmJ6d2ZnbmFmeXlhaWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTI2OTksImV4cCI6MjA5NzEyODY5OX0.Zd2i8ryNQs2Vg2vVxgTXV-FkAYPFLoGJfH_BTIr5cpQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Trigger one immediate run so the 2 stuck jobs start processing now
SELECT net.http_post(
  url := 'https://zapblastapi.lovable.app/api/public/group-launcher/tick',
  headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5YWJ0cmJ6d2ZnbmFmeXlhaWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTI2OTksImV4cCI6MjA5NzEyODY5OX0.Zd2i8ryNQs2Vg2vVxgTXV-FkAYPFLoGJfH_BTIr5cpQ"}'::jsonb,
  body := '{}'::jsonb
);