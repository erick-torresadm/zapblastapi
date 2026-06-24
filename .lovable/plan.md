
# Integração ZapBlast ↔ Twenty CRM

Twenty self-hosted já está no ar em `crm.membropro.com.br`. ZapBlast vira produtor de dados (contatos WhatsApp + mensagens) e o Twenty vira a UI de CRM. A aba **Conversas** ganha um toggle "Usar Twenty".

> **Antes do build:** revogue a API key que veio no chat e gere uma nova no Twenty (Settings → Developers → API Keys). Você vai colar a nova na tela de configuração — ela é salva criptografada no banco, não no código.

## 1. Modelo de dados (migration)

**`twenty_connections`** — uma conexão por usuário ZapBlast
- `user_id` (FK auth.users, UNIQUE) · `base_url` · `api_key_encrypted` (bytea via `pgsodium.crypto_aead_det_encrypt`) · `workspace_id` · `enabled` (bool) · `replace_inbox` (bool) · `last_test_at` · `last_test_ok` · timestamps
- RLS: dono lê/escreve; service_role full
- A chave nunca volta pro client — server fn de teste retorna só `{ok, error}`

**`twenty_contact_map`** — evita duplicar contato no Twenty
- `user_id` · `phone_e164` · `twenty_person_id` · `synced_at`
- UNIQUE (`user_id`, `phone_e164`)

**`twenty_sync_queue`** — fila de mensagens a virar nota no Twenty
- `user_id` · `chat_message_id` · `status` (pending/done/failed) · `attempts` · `last_error`
- Trigger AFTER INSERT em `chat_messages` enfileira automático (só se o user tem conexão `enabled`)

**`twenty_deals_cache`** — pipeline pra dashboard
- `user_id` · `twenty_id` · `name` · `amount_micros` · `currency` · `stage` · `close_date` · `updated_at`

## 2. Camada server

**`src/lib/twenty.server.ts`** (server-only helper)
- `decryptApiKey(userId)` — lê `twenty_connections`, descriptografa
- `twentyFetch(conn, path, init)` — wrapper `fetch` com `Authorization: Bearer`, base = `${conn.base_url}/rest`, trata 401/429/5xx com mensagem amigável
- Endpoints usados (confirmados acima): `GET/POST /people`, `POST /notes`, `POST /noteTargets`, `GET /opportunities`

**`src/lib/twenty.functions.ts`** (`createServerFn` + `requireSupabaseAuth`)
- `getTwentyConnection()` — retorna `{base_url, enabled, replace_inbox, last_test_ok}` (sem a key)
- `saveTwentyConnection({base_url, api_key, enabled, replace_inbox})` — valida URL https, criptografa key, testa conexão antes de salvar
- `testTwentyConnection()` — chama `/rest/people?limit=1`, atualiza `last_test_*`
- `disconnectTwenty()` — apaga linha
- `pushContactToTwenty({contact_id})` — upsert via `twenty_contact_map`; mapeia nome/phone E.164
- `getTwentyDealsCached()` — leitura pro widget

## 3. Sincronização automática

**Trigger DB** em `chat_messages` AFTER INSERT:
```
IF EXISTS twenty_connections WHERE user_id=NEW.owner_user_id AND enabled
  INSERT INTO twenty_sync_queue (...)
```

**Endpoint `/api/public/twenty-sync`** (TSS server route, autenticado por `apikey` header = SUPABASE anon key):
- Pega até 200 itens `pending` da fila, agrupa por user
- Pra cada msg: garante `person` no Twenty (cria se não existir via `twenty_contact_map`), cria `note` com corpo da msg + timestamp, linka via `noteTargets`
- Marca `done`/`failed`

**Endpoint `/api/public/twenty-deals-refresh`**:
- Pra cada user com conexão `enabled`: `GET /opportunities?limit=200` e faz upsert em `twenty_deals_cache`

**pg_cron:**
- `twenty-sync-messages` — `* * * * *` (1min)
- `twenty-deals-refresh` — `*/5 * * * *`

## 4. UI no ZapBlast

**`/app/settings/twenty`** (nova rota)
- Card "Twenty CRM" com:
  - Input URL (pré-preenche `https://crm.membropro.com.br`)
  - Input API Key (type=password, only-on-create, "Substituir" pra trocar)
  - Botão **Testar conexão** → mostra ✓/✗ inline
  - Switch **Ativar sincronização** (liga trigger de fila)
  - Switch **Substituir aba Conversas pelo Twenty**
  - Botão Desconectar
- Link na sidebar Settings

**Aba Conversas (`/app/inbox`)**
- Se `replace_inbox = true`: renderiza tela cheia com botão grande **"Abrir Twenty CRM"** (`target=_blank`, abre `base_url`) + mini-stats ("X mensagens sincronizadas hoje"). Não uso iframe — Twenty serve `X-Frame-Options: DENY` por padrão.
- Senão: CRM atual inalterado.
- Banner discreto "Powered by Twenty" quando ativo.

**Dashboard** (`/app/dashboard`)
- Widget "Pipeline (Twenty)" — lê `twenty_deals_cache`: total de deals, soma de `amount`, top 5 por estágio. Link "Ver no CRM" → `${base_url}/objects/opportunities`.

**Sidebar**
- Item "Conversas" ganha badge `Twenty` (azul) quando `replace_inbox` ativo, junto com o badge `Beta` atual.

## 5. O que NÃO vou fazer

- ❌ Migrar `crm_contacts_profile` / `crm_conversations` antigos pro Twenty (você pediu começar do zero)
- ❌ Mexer no CRM atual — fica em paralelo, controlado pelo toggle
- ❌ Iframe do Twenty (bloqueado por `X-Frame-Options`)
- ❌ Guardar API key em variável de ambiente — é per-user, vai no banco criptografado

## Limitações conhecidas

1. Se você desligar o Docker, sync vai falhar (`last_error` registrado, retry automático).
2. Twenty REST API é beta — se mudarem schema de `people`/`opportunities` quebra; tratei com try/catch + log.
3. `crm.membropro.com.br` precisa ter cert válido (parece OK, está atrás de Cloudflare).

## Arquivos

**Criar:** `src/lib/twenty.server.ts`, `src/lib/twenty.functions.ts`, `src/routes/_authenticated/app.settings.twenty.tsx`, `src/routes/api/public/twenty-sync.ts`, `src/routes/api/public/twenty-deals-refresh.ts`, migration (tabelas + trigger + criptografia + cron)

**Editar:** rota da inbox (toggle), `AppSidebar.tsx` (badge + link settings), dashboard (widget)

Pode aprovar que sigo. Quando você ativar o toggle pela primeira vez na tela `/app/settings/twenty`, a sincronização começa a partir daquele momento — mensagens antigas não retroagem (posso adicionar botão "Importar últimos 30 dias" depois se quiser).
