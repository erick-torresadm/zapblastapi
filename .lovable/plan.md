## Aquecimento Automático de Chips

Chips recém-conectados precisam parecer "humanos" antes de disparar em massa. A ideia: os próprios chips do usuário (e, opcionalmente, do pool global da plataforma) trocam mensagens entre si — saudações, perguntas, áudios curtos, figurinhas — simulando conversas naturais. Isso aumenta a reputação do número no WhatsApp e reduz risco de banimento quando a campanha real começar.

### Como funciona

1. Usuário liga o **modo aquecimento** num chip conectado e define a intensidade:
   - **Leve** (chip novo, 1ª semana): ~20 msgs/dia, ramp-up gradual
   - **Médio** (2ª semana): ~50 msgs/dia
   - **Forte** (manutenção): ~100 msgs/dia
2. A plataforma escolhe pares de chips do mesmo usuário que também estão em modo aquecimento e os emparelha.
3. A cada poucos minutos (com aleatoriedade), um worker dispara uma mensagem do chip A para o chip B usando um banco de frases naturais com spintax.
4. O chip B "lê" via webhook (já temos `incoming_messages`) e, depois de um delay humano (15s a 3min), responde algo coerente.
5. O `daily_warmup_sent` é separado do `sent_today` da campanha — aquecimento não compete com disparo real.
6. Após X dias o sistema sobe automaticamente o `daily_limit` da campanha (ex: 50 → 200 → 500 → 1000).

### Painel do usuário

Nova aba **Aquecimento** mostrando, por chip:
- Status (ligado/desligado), intensidade, dia do aquecimento (1, 2, 3…)
- Msgs trocadas hoje / total
- Score de "saúde" (% baseado em dias ativos, respostas recebidas, sem ban)
- Botão "Pausar / Retomar / Resetar"

### Mudanças no banco

**Novos campos em `whatsapp_instances`:**
- `warmup_enabled` (bool), `warmup_intensity` (leve/médio/forte), `warmup_started_at`, `warmup_day` (calculado), `warmup_sent_today`, `warmup_received_today`, `warmup_last_at`, `health_score` (0-100).

**Nova tabela `warmup_messages`** — biblioteca de frases por categoria (saudação, pergunta casual, resposta curta, emoji, etc.), pré-populada em pt-BR com ~80 frases e spintax. Usuário pode adicionar próprias.

**Nova tabela `warmup_conversations`** — registro de cada troca (from_instance, to_instance, message, sent_at, replied_at, evolution_message_id) para auditoria e dashboard.

### Engine de aquecimento

Novo endpoint `/api/public/warmup-worker` chamado pelo mesmo `pg_cron` a cada minuto:
1. Para cada usuário com 2+ chips em modo aquecimento, monta pares aleatórios.
2. Respeita a cota diária da intensidade (com ramp-up: dia 1 = 30% da cota, dia 7 = 100%).
3. Respeita janela de horário humano (8h-22h no fuso do usuário) e delays aleatórios entre mensagens.
4. Sorteia frase de `warmup_messages`, resolve spintax, envia A→B.
5. Agenda resposta de B→A com delay humano via campo `reply_due_at` (worker pega no tick seguinte).
6. Atualiza contadores, `health_score` e `warmup_day`.

Fallback se o usuário tem só 1 chip: opção (opt-in) de usar o **pool global** — chip do usuário conversa com chip de outro cliente que também aceitou o pool, com mensagens 100% neutras. Mantém privacidade (nada do dispatch real é compartilhado).

### Variações naturais

Para não parecer bot:
- Texto puro 70%, emoji 15%, áudio curto pré-gravado 10%, figurinha 5% (Fase 2 expande mídia).
- Distribuição não-uniforme de horários (mais conversa de manhã e à noite).
- Conversas em "rajadas" curtas (3-5 msgs seguidas) e depois pausa de horas.

### Integração com campanha

- Chips em aquecimento (dia < 7 e intensidade leve) ficam **bloqueados** pra campanhas — só liberam após X dias.
- O wizard de campanha mostra um aviso se o chip selecionado ainda está "verde".
- Após o aquecimento concluído, o `daily_limit` sobe automaticamente conforme a curva.

### Fases

**Fase 1 (agora):** schema, biblioteca de frases pt-BR, toggle por chip, worker de envio + resposta, dashboard básico, ramp-up, bloqueio de campanha durante warmup.

**Fase 2 (depois):** pool global cross-tenant, áudios/figurinhas, ML pra detectar padrão de ban, A/B de templates de aquecimento.

### Perguntas

1. **Pool global** entre clientes do SaaS — incluir já na Fase 1 (mais eficaz pra quem tem 1 chip só) ou deixar pra Fase 2?
2. **Janela de horário humano** — fixa 8h-22h (horário de Brasília) ou cada usuário configura?
3. **Bloqueio de campanha durante warmup inicial** — devo travar mesmo (mais seguro) ou só avisar e deixar o usuário decidir?