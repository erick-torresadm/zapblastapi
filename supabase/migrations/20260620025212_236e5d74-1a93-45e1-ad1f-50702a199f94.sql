-- Remove duplicatas mantendo a linha mais antiga por (user_id, instance_id, evolution_message_id).
DELETE FROM public.incoming_messages a
USING public.incoming_messages b
WHERE a.evolution_message_id IS NOT NULL
  AND a.user_id = b.user_id
  AND a.instance_id IS NOT DISTINCT FROM b.instance_id
  AND a.evolution_message_id = b.evolution_message_id
  AND a.received_at > b.received_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incoming_messages_evo_id
  ON public.incoming_messages (user_id, instance_id, evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;