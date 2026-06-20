ALTER TABLE public.group_create_jobs
ADD COLUMN IF NOT EXISTS participant_phone TEXT;

UPDATE public.group_create_jobs
SET status = 'failed',
    last_error = 'WhatsApp/Evolution exige pelo menos 1 participante inicial para criar grupo. Recrie a fila informando um telefone.',
    updated_at = now()
WHERE status IN ('pending', 'processing')
  AND participant_phone IS NULL;

DO $$
BEGIN
  PERFORM cron.unschedule('group-launcher-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('group-launcher-tick-every-minute');
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