
-- Enum de intensidade
CREATE TYPE public.warmup_intensity AS ENUM ('leve', 'medio', 'forte');
CREATE TYPE public.warmup_category AS ENUM ('saudacao', 'pergunta', 'resposta', 'casual', 'emoji', 'despedida');

-- Adiciona colunas em whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN warmup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN warmup_intensity public.warmup_intensity NOT NULL DEFAULT 'leve',
  ADD COLUMN warmup_started_at TIMESTAMPTZ,
  ADD COLUMN warmup_sent_today INT NOT NULL DEFAULT 0,
  ADD COLUMN warmup_received_today INT NOT NULL DEFAULT 0,
  ADD COLUMN warmup_total_sent INT NOT NULL DEFAULT 0,
  ADD COLUMN warmup_last_at TIMESTAMPTZ,
  ADD COLUMN health_score INT NOT NULL DEFAULT 50;

-- Biblioteca de frases (globais + por usuário)
CREATE TABLE public.warmup_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
  category public.warmup_category NOT NULL,
  content TEXT NOT NULL, -- pode ter spintax {oi|olá|eai}
  weight INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_messages TO authenticated;
GRANT ALL ON public.warmup_messages TO service_role;
ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read globals or own" ON public.warmup_messages FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Manage own warmup msgs" ON public.warmup_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversas trocadas
CREATE TABLE public.warmup_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  to_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  category public.warmup_category NOT NULL,
  message TEXT NOT NULL,
  evolution_message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  reply_due_at TIMESTAMPTZ, -- quando agendar a resposta de volta
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_conversations TO authenticated;
GRANT ALL ON public.warmup_conversations TO service_role;
ALTER TABLE public.warmup_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own warmup convos" ON public.warmup_conversations FOR SELECT
  USING (auth.uid() = user_id);
CREATE INDEX idx_warmup_convos_due ON public.warmup_conversations(reply_due_at) WHERE replied = FALSE AND reply_due_at IS NOT NULL;
CREATE INDEX idx_warmup_convos_user ON public.warmup_conversations(user_id, sent_at DESC);

-- Seed: ~80 frases globais em pt-BR
INSERT INTO public.warmup_messages (user_id, category, content, weight) VALUES
-- saudações
(NULL, 'saudacao', '{Oi|Olá|Eai|Opa}!', 3),
(NULL, 'saudacao', '{Bom dia|Boa tarde|Boa noite}', 3),
(NULL, 'saudacao', '{Oi|Olá}, tudo {bem|certo|tranquilo}?', 3),
(NULL, 'saudacao', 'E aí, {beleza|tranquilo|de boa}?', 2),
(NULL, 'saudacao', 'Fala {mano|cara|amigo}!', 2),
(NULL, 'saudacao', '{Oi|Olá} 👋', 2),
(NULL, 'saudacao', 'Sumido(a) hein 😅', 1),
(NULL, 'saudacao', 'Quanto tempo!', 1),
-- perguntas casuais
(NULL, 'pergunta', 'Como {está|tá} {seu dia|tudo|a vida}?', 2),
(NULL, 'pergunta', 'Tudo {bem|certo|ok} aí?', 3),
(NULL, 'pergunta', 'Como {foi|tá sendo} {o trabalho|o dia|a semana}?', 2),
(NULL, 'pergunta', 'Viu {as notícias|o jogo|aquele vídeo} {hoje|ontem}?', 1),
(NULL, 'pergunta', 'Vai {sair|fazer algo} {hoje|amanhã|no fim de semana}?', 1),
(NULL, 'pergunta', 'Já {almoçou|jantou|tomou café}?', 2),
(NULL, 'pergunta', 'Que horas você {chega|sai} {hoje|amanhã}?', 1),
(NULL, 'pergunta', 'Tá {chovendo|fazendo sol|frio} aí?', 1),
(NULL, 'pergunta', 'Cadê você?', 1),
(NULL, 'pergunta', 'Tudo certo com {você|a família|o trabalho}?', 2),
-- respostas
(NULL, 'resposta', '{Tudo|Tá tudo} {bem|certo|tranquilo} {sim|por aqui}!', 3),
(NULL, 'resposta', '{Sim|Claro|Certeza}!', 3),
(NULL, 'resposta', '{Pode crer|Com certeza|Verdade}', 2),
(NULL, 'resposta', '{Boa|Legal|Massa|Show}!', 3),
(NULL, 'resposta', '{Entendi|Saquei|Beleza}', 3),
(NULL, 'resposta', 'Aqui {tá|está} {tranquilo|de boa|tudo certo}', 2),
(NULL, 'resposta', 'E você, {como tá|tudo bem}?', 2),
(NULL, 'resposta', 'Mais ou menos, e aí?', 1),
(NULL, 'resposta', '{Que bom|Que legal|Show de bola}!', 2),
(NULL, 'resposta', 'Verdade {kkk|haha|rsrs}', 2),
(NULL, 'resposta', '{Ahh|Hmm} entendi', 2),
(NULL, 'resposta', 'Tá {certo|combinado}', 2),
(NULL, 'resposta', '{Pois é|Né|Exato}', 2),
-- casual
(NULL, 'casual', 'Acabei de {chegar|sair|terminar}', 1),
(NULL, 'casual', 'Hoje tô {ocupado|cansado|tranquilo}', 1),
(NULL, 'casual', '{Depois|Mais tarde} a gente {conversa|fala melhor}', 1),
(NULL, 'casual', 'Tô {trabalhando|estudando|na rua} agora', 1),
(NULL, 'casual', '{Te ligo|Te chamo} {depois|mais tarde}', 1),
(NULL, 'casual', 'Vou {dar uma volta|sair um pouco|tomar um café}', 1),
(NULL, 'casual', 'Que {dia|semana} {corrida|cheia} hein', 1),
(NULL, 'casual', '{Tô|Estou} com {fome|sono|preguiça}', 1),
(NULL, 'casual', 'Acordei {cedo|atrasado|bem} hoje', 1),
-- emoji
(NULL, 'emoji', '👍', 2),
(NULL, 'emoji', '😂', 2),
(NULL, 'emoji', '🙏', 1),
(NULL, 'emoji', '❤️', 1),
(NULL, 'emoji', '😅', 2),
(NULL, 'emoji', '👏', 1),
(NULL, 'emoji', '🤝', 1),
(NULL, 'emoji', '🔥', 1),
(NULL, 'emoji', '😎', 1),
(NULL, 'emoji', '🤔', 1),
-- despedidas
(NULL, 'despedida', '{Tchau|Falou|Até mais}!', 2),
(NULL, 'despedida', '{Bom dia|Boa tarde|Boa noite}!', 2),
(NULL, 'despedida', 'Depois a gente se fala', 1),
(NULL, 'despedida', 'Abraço!', 2),
(NULL, 'despedida', '{Valeu|Obrigado|Vlw}!', 2),
(NULL, 'despedida', 'Até {amanhã|mais tarde|breve}', 1);
