ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS last_qr_base64 TEXT,
  ADD COLUMN IF NOT EXISTS last_qr_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_qr_error TEXT;