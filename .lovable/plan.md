## Visão geral

Integrar **Chatwoot self-hosted** (chatwoot.membropro.com.br) ao Perseidas com:
- **Multi-tenant automático**: cada usuário do Perseidas vira 1 conta + 1 usuário no Chatwoot, criados via Platform App Token.
- **Aba Conversas embedada**: iframe com SSO (sem login) mostrando o Chatwoot do próprio usuário.
- **Sincronização bidirecional** com WhatsApp (Evolution): mensagens recebidas viram conversas no Chatwoot; respostas do agente no Chatwoot saem pelo WhatsApp.
- **Twenty fica lado a lado**: usuário escolhe nas settings qual integração ocupa a aba Conversas.

## Pré-requisitos (você faz)

1. Adicionar 2 secrets server-side:
   - `CHATWOOT_BASE_URL` = `https://chatwoot.membropro.com.br`
   - `CHATWOOT_PLATFORM_TOKEN` = token do `/super_admin/platform_apps/1` (você já tem)
2. Confirmar que `chatwoot.membropro.com.br` permite iframe (sem `X-Frame-Options`). Vou testar antes de codar.

## Parte 1 — Banco

4 tabelas novas, todas RLS per `user_id`:

- **`chatwoot_connections`** (1:1 por user): `chatwoot_account_id`, `chatwoot_user_id`, `user_access_token_encrypted` (pgsodium), `email_used`, `enabled`, `replace_inbox`, `last_test_ok`, `last_test_at`, `last_test_error`.
- **`chatwoot_inbox_map`**: `user_id`, `instance_id` → `chatwoot_inbox_id`. 1 inbox tipo "API" por instância WhatsApp do usuário.
- **`chatwoot_contact_map`**: `user_id`, `phone_e164` → `chatwoot_contact_id`, `chatwoot_conversation_id` (dedup).
- **`chatwoot_sync_queue`**: `user_id`, `chat_message_id`, `direction` (inbound|outbound_from_chatwoot), `status`, `attempts`, `last_error`.

Trigger `AFTER INSERT` em `chat_messages` enfileira na `chatwoot_sync_queue` quando o user tem connection `enabled`.

## Parte 2 — Servidor

**`src/lib/chatwoot.server.ts`** — wrapper de fetch:
- `platformFetch(path, init)` → header `api_access_token: <PLATFORM_TOKEN>`
- `userFetch(userToken, path, init)` → header `api_access_token: <userToken>`

**`src/lib/chatwoot.functions.ts`** (`createServerFn` + `requireSupabaseAuth`):
- `provisionChatwootFn()` — fluxo de 1 clique:
  1. `POST /platform/api/v1/accounts { name: <perseidas_email> }` → `account_id`
  2. `POST /platform/api/v1/users { email, name, password: random, role: administrator }`
  3. `POST /platform/api/v1/accounts/{id}/account_users { user_id, role: administrator }`
  4. Lê `access_token` retornado pelo step 2 → salva criptografado.
- `getChatwootConnectionFn`, `testChatwootConnectionFn`, `disconnectChatwootFn`.
- `getChatwootSsoUrlFn()` — `GET /platform/api/v1/users/{id}/login` → retorna URL única com token SSO embutido pro iframe (sem expor o user token no browser).
- `setChatwootReplaceInboxFn`, `setChatwootEnabledFn`.

## Parte 3 — Sincronização

### WhatsApp → Chatwoot (worker)

**`/api/public/chatwoot-sync`** (POST, cron 1min, auth `apikey` anon):
- Pega lotes de `chatwoot_sync_queue.status='pending'`.
- Garante `chatwoot_inbox_id` da instância (cria se não existir: `POST /api/v1/accounts/{id}/inboxes` type=Api).
- Garante `chatwoot_contact_id` do telefone (`POST /api/v1/accounts/{id}/contacts` ou search).
- Garante `chatwoot_conversation_id` aberta (`POST /api/v1/accounts/{id}/conversations`).
- Posta mensagem: `POST /api/v1/accounts/{id}/conversations/{cid}/messages { content, message_type: 'incoming' | 'outgoing', private: false }`.
- Atualiza `status='done'` ou incrementa `attempts` + `last_error`.

### Chatwoot → WhatsApp (webhook)

**`/api/public/chatwoot-webhook`** (POST público):
- Body do Chatwoot inclui `account.id`, `inbox.id`, `conversation`, `content`, `message_type`.
- Filtra **só** `message_type='outgoing'` E **não** vindo da sync (evita loop — marca mensagens enviadas por nós com `private: true` ou checka `source_id`).
- Resolve `account_id → user_id` via `chatwoot_connections`.
- Resolve `inbox_id → instance_id` via `chatwoot_inbox_map`.
- Resolve telefone do contato via Chatwoot API ou `chatwoot_contact_map` reverso.
- Chama Evolution `sendText` (ou `sendMedia`) na instância → insere em `chat_messages` (com flag `from_chatwoot=true` pra trigger não re-enfileirar).

Configuração do webhook (1x manual, ou auto-criar no provisionamento via `POST /api/v1/accounts/{id}/webhooks { url, subscriptions: ['message_created'] }`). Vou fazer **auto** dentro do `provisionChatwootFn`.

### Proteção do webhook

Chatwoot não assina HMAC nativo por default. Vou validar via **token compartilhado na URL**: `/api/public/chatwoot-webhook?secret=<gerado por user>` — gero um `webhook_secret` randômico por connection, guardo no DB, valido no handler. Sem secret válido → 401.

## Parte 4 — UI

**`/app/settings/chatwoot`** (nova rota):
- Estado **desconectado**: botão grande "Conectar meu Chatwoot" → chama `provisionChatwootFn` → mostra "conta criada ✓" + email/senha (mostra senha 1x pro usuário guardar caso queira logar fora do Perseidas).
- Estado **conectado**: status badge, toggles `enabled` (sync) + `replace_inbox` (troca aba Conversas), botão "Abrir Chatwoot ↗", "Desconectar".

**`/app/inbox`** (alterar `InboxOrTwenty` → `InboxOrCRM`):
- Se `chatwoot.enabled && chatwoot.replace_inbox` → `<ChatwootEmbed>` com SSO URL (refresh a cada 50min, válido por 1h).
- Senão se `twenty.enabled && twenty.replace_inbox` → mantém `<TwentyEmbed>`.
- Senão → CRM interno.

**`/app/profile`**: card extra "Chatwoot" ao lado do "Twenty CRM".

**Validação de conflito**: se usuário tentar ativar `replace_inbox` em ambos, settings avisa "só um pode ocupar a aba; o outro fica em background sincronizando".

## Parte 5 — Cron

```sql
SELECT cron.schedule('chatwoot-sync-every-minute', '* * * * *',
  $$ SELECT net.http_post(url:='https://.../api/public/chatwoot-sync',
     headers:='{"apikey":"<anon>"}'::jsonb, body:='{}'::jsonb) $$);
```

## Arquivos criados/editados

**Novos** (~8):
- `src/lib/chatwoot.server.ts`
- `src/lib/chatwoot.functions.ts`
- `src/routes/api/public/chatwoot-sync.ts`
- `src/routes/api/public/chatwoot-webhook.ts`
- `src/routes/_authenticated/app.settings.chatwoot.tsx`
- `src/components/chatwoot/ChatwootEmbed.tsx`
- Migração SQL (4 tabelas + trigger + grants + RLS + pg_cron schedule)

**Editados** (~3):
- `src/routes/_authenticated/app.inbox.tsx` — substituir `InboxOrTwenty` por `InboxOrCRM` com 3 vias.
- `src/routes/_authenticated/app.profile.tsx` — adicionar card Chatwoot.
- `mem://features/chatwoot` + index.

## Limitações que aceito

- **Senha do usuário Chatwoot**: gerada aleatória, mostrada **1x** no provisioning. Usuário pode resetar dentro do Chatwoot depois.
- **Sem migração de conversas antigas**: começa do zero no Chatwoot (combinado).
- **Mídia (áudio/imagem/doc)**: round 1 envia só texto e legenda; mídia fica em URL anexa no corpo da mensagem. Upload binário pro Chatwoot fica pra round 2 se você quiser.
- **Loop de eco**: protejo marcando origem (`from_chatwoot=true` no `chat_messages` + skip no trigger; `source_id=perseidas:<msg_id>` no Chatwoot pra dedup).
- **Webhook em localhost**: se o Chatwoot rodar no seu Docker local, ele não consegue chamar o Perseidas publicado. No `chatwoot.membropro.com.br` (público) funciona normal.

## Pergunto antes de executar

Confirmou tudo nas 3 perguntas anteriores. Antes de eu pedir os secrets e rodar a migração, **só me diga se posso usar seu email do Perseidas como base do email do usuário Chatwoot auto-criado** (ex: `voce@perseidas.com.br` → conta "voce" no Chatwoot). Se preferir outro formato (ex: `<user_id>@perseidas.local`), me avisa.
