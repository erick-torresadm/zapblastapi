
CREATE OR REPLACE FUNCTION public._twenty_enqueue_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.twenty_connections WHERE user_id = NEW.user_id AND enabled = true) THEN
    INSERT INTO public.twenty_sync_queue (user_id, chat_message_id)
    VALUES (NEW.user_id, NEW.id)
    ON CONFLICT (chat_message_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._twenty_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
