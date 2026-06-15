
# Plataforma SaaS de Disparo em Massa via Evolution API

## Visão geral

Plataforma multi-tenant onde cada cliente conecta vários chips (instâncias Evolution), importa listas, e dispara campanhas com rotação inteligente entre números, delays humanos, spintax e limites diários — tudo pra evitar ban e baratear o custo vs WhatsApp Cloud API oficial.

**Modelo econômico:** chip ~R$7 + Evolution self-hosted = custo marginal por mensagem tendendo a zero, vs R$0,35 da API oficial. Margem alta pra revender em planos mensais.

## Arquitetura

```text
Cliente (browser)
   │
   ▼
TanStack Start (frontend + server functions)
   │
   ├── Lovable Cloud (Supabase)
   │     ├── Auth (email/senha + Google)
   │     ├── Postgres (tenants, chips, campanhas, contatos, logs)
   │     ├── Storage (mídias das campanhas, CSVs)
   │     └── pg_cron + pgmq (worker de envio)
   │
   └── Evolution API (servidor do cliente — VPS própria)
         └── instâncias = 1 chip cada
```

O **worker de envio** roda como server route público (`/api/public/dispatch-worker`) acordado por pg_cron a cada N segundos. Ele pega mensagens pendentes da fila, escolhe o próximo chip (round-robin respeitando limites/delays) e POSTa no Evolution do tenant.

## Modelo de dados (Postgres)

- `profiles` — dados do usuário (nome, plano)
- `user_roles` — admin/user (tabela separada, função `has_role` security definer)
- `evolution_servers` — `id, user_id, base_url, api_key (criptografada)` — endpoint do Evolution do cliente
- `whatsapp_instances` — `id, server_id, instance_name, phone_number, status (connected/disconnected/banned), daily_limit, sent_today, last_sent_at`
- `contact_lists` — `id, user_id, name, total_count`
- `contacts` — `id, list_id, phone, variables (jsonb: nome, etc), opted_out`
- `campaigns` — `id, user_id, name, message_template (spintax), media_url, media_type, list_id, status (draft/scheduled/running/paused/done), scheduled_for, min_delay_s, max_delay_s, created_at`
- `campaign_messages` — fila de envio: `id, campaign_id, contact_id, instance_id (escolhido na hora ou pré-alocado), status (pending/sent/delivered/read/failed/replied), rendered_message, evolution_message_id, sent_at, error`
- `incoming_messages` — respostas capturadas via webhook do Evolution
- `plans` / `subscriptions` — limites por plano (nº de chips, msgs/mês), Stripe

Todas as tabelas com RLS isolando por `user_id`. GRANTs explícitos pra `authenticated` e `service_role`.

## Telas principais

1. **Auth** — login/cadastro (email+senha, Google) via `/auth`
2. **Dashboard** — KPIs: chips conectados, msgs enviadas hoje, taxa de entrega, campanhas ativas
3. **Servidores Evolution** — CRUD do endpoint + API key
4. **Chips (Instâncias)** — listar, criar nova (gera QR code via Evolution `/instance/create` + `/instance/connect`), ver status em tempo real, deletar, definir limite diário
5. **Listas de contatos** — upload CSV (parse client-side, validação E.164, dedupe), visualizar, opt-out manual
6. **Campanhas** — wizard:
   - Step 1: nome + lista
   - Step 2: mensagem com editor spintax `{Oi|Olá|E aí} {{nome}}` + preview de 5 variações
   - Step 3: mídia opcional (upload pra Storage)
   - Step 4: agendamento + delay min/max + chips a usar
   - Step 5: revisar e disparar
7. **Relatórios** — por campanha: enviadas/entregues/lidas/falha/respostas, gráfico temporal, export CSV
8. **Caixa de entrada** — respostas recebidas agrupadas por contato
9. **Billing** — planos, upgrade via Stripe

## Engine de disparo (o coração)

**Enfileiramento:** ao iniciar campanha, gera um row em `campaign_messages` por contato, com `rendered_message` já com spintax resolvido + variáveis substituídas.

**Worker (`/api/public/dispatch-worker`, acordado por pg_cron a cada 10s):**
1. Lock advisory pra não rodar duas vezes
2. Pega até N mensagens `pending` ordenadas por campanha (respeitando `scheduled_for`)
3. Pra cada mensagem:
   - Escolhe instância: round-robin entre chips `connected` do tenant que ainda não atingiram `daily_limit` e cujo `last_sent_at` + delay aleatório já passou
   - Se nenhum chip disponível agora → deixa pra próximo tick
   - POST `Evolution /message/sendText` ou `/sendMedia` com `{ number, text, delay }`
   - Atualiza `status`, `evolution_message_id`, `instance.sent_today++`, `instance.last_sent_at`
   - Em erro 4xx → marca `failed`; em erro de conexão → marca chip como `disconnected` e re-enfileira
4. Reset diário de `sent_today` via cron 00:00

**Anti-ban embutido:**
- Round-robin entre chips
- Delay aleatório `min_delay_s..max_delay_s` (default 15-60s) por chip
- Limite diário por chip (default 200, configurável)
- Spintax resolvido por mensagem (cada envio é único)
- Warmup mode: chip novo começa com limite baixo e cresce automaticamente

**Webhook do Evolution** (`/api/public/evolution-webhook/:tenantToken`):
- Verifica token do tenant
- `messages.upsert` → atualiza status de entrega/leitura ou grava resposta em `incoming_messages`
- `connection.update` → atualiza status do chip

## Stack técnica

- **Frontend:** TanStack Start + React + shadcn + Tailwind
- **Backend:** server functions (`createServerFn`) para CRUD; server routes (`/api/public/*`) para worker e webhook
- **DB/Auth/Storage:** Lovable Cloud (Supabase)
- **Filas/cron:** pg_cron + tabela `campaign_messages` (sem precisar de pgmq pra MVP)
- **Pagamento:** Stripe (`enable_stripe_payments`)
- **Evolution API:** self-hosted pelo cliente; plataforma só consome HTTP

## Segurança

- API keys do Evolution criptografadas em repouso (coluna com pgcrypto, chave em secret)
- RLS rigoroso em todas as tabelas
- Webhook do Evolution autenticado por token único por tenant
- Validação Zod em todo input
- Opt-out automático ao receber "PARAR" / "SAIR"
- Limites por plano enforced no server function antes de enfileirar

## Roadmap em fases

**Fase 1 — MVP (esta entrega):**
- Auth + multi-tenant
- CRUD servidor Evolution + chips com QR code
- Upload CSV + listas
- Criação de campanha (texto + spintax + mídia + agendamento)
- Worker de disparo com rotação, delay, limite
- Webhook básico de status
- Dashboard e relatório por campanha

**Fase 2 (depois):**
- Stripe + planos
- Caixa de entrada de respostas com chatbot básico
- Warmup automático
- A/B test de mensagens
- Templates salvos
- Equipes/sub-usuários

## O que preciso de você

1. **Subir o Evolution API** numa VPS e me passar uma URL de teste + API key pra eu validar o fluxo na Fase 1 (pode ser depois do MVP estar pronto — a UI já vai estar lá pra cadastrar)
2. **Confirmar:** começo pela Fase 1 sem Stripe (acesso livre), e adicionamos pagamento na Fase 2? Ou já quer Stripe desde o início?

Quando aprovar, ativo o Lovable Cloud e começo pela base: schema do banco + auth + telas de servidores/chips.
