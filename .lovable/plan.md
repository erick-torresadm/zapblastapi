## Problema

17 conversas no CRM ficam em **"Identificando…"** porque o JID é `@lid` (criptografado do WhatsApp) e o resolvedor atual (`lookup_lid_phone`) só funciona quando o webhook já recebeu uma mensagem **pareada** (`remoteJid=@s.whatsapp.net` + `remoteJidAlt=@lid`) na tabela `incoming_messages`. Se esse pareamento nunca chegou, o número nunca resolve — e o retry só repete a mesma consulta vazia.

A solução correta (usada pelo próprio Evolution e Baileys) é **baixar o mapa `@lid ↔ telefone real` direto da instância**, que o Baileys mantém em memória/disco. A Evolution expõe isso em `POST /chat/findChats/{instance}`, cuja resposta traz `remoteJid` (telefone real) **e** `remoteJidAlt` (o `@lid` correspondente) por chat — exatamente o que falta.

## O que vou construir

### 1. Migration: cache de mapeamento + função melhorada

`supabase/migrations/<ts>_crm_lid_map.sql`:

- Tabela `public.crm_lid_map(owner_user_id, instance_id, lid_jid, phone, updated_at)` com `UNIQUE(owner_user_id, instance_id, lid_jid)`. RLS scoped por workspace.
- Função `crm_upsert_lid_map(owner, instance, lid, phone)` SECURITY DEFINER usada pelo sync.
- **Substituir `lookup_lid_phone`** para consultar `crm_lid_map` em **prioridade 0** (antes das fontes atuais a/b/c). Assim o trigger `BEFORE INSERT` em `chat_messages` resolve instantaneamente quando o mapa já foi sincronizado.
- Função `crm_apply_lid_resolution(owner_user_id)`: percorre `crm_conversations` com `contact_jid LIKE '%@lid'` e, se houver entrada em `crm_lid_map`, atualiza `contact_phone`/`contact_jid` e marca `is_resolved=true`. Faz merge via `crm_merge_conversations` quando já existe conversa com o telefone real.

### 2. Wrapper Evolution: `findChats`

Em `src/lib/evolution.server.ts`:

- Adicionar endpoint `findChats: POST /chat/findChats/{instance}`.
- `export async function findChats(server, instanceName)` → `POST` com body `{}`, retorna array de chats com `remoteJid`, `remoteJidAlt`, `pushName`, `profilePicUrl`, `name`.

### 3. Server fn: `syncInstanceContactsFn`

Novo em `src/lib/crm-profile.functions.ts`:

- Input: `{ instance_id }`.
- Autoriza via `requireSupabaseAuth` + checa que a instância pertence ao workspace (`crm_is_workspace_member`).
- Busca server Evolution + nome da instância (status precisa ser `connected`).
- Chama `findChats` e `findContacts`:
  - Para cada chat com `remoteJidAlt` que termina em `@lid` e `remoteJid` que casa `\d+@s.whatsapp.net`: chama `crm_upsert_lid_map`.
  - Para cada contato com `pushName`/`profilePicUrl` e telefone resolvido: upsert em `crm_contacts_profile`.
- No fim, executa `crm_apply_lid_resolution(userId)` para destravar as conversas presas.
- Retorna `{ chats_scanned, lid_mapped, profiles_cached, conversations_resolved }`.

### 4. UI: botão de sincronizar + auto-sync na primeira visita

`src/routes/_authenticated/app.inbox.tsx` (ou onde o CRM lista as conversas):

- Botão no header **"Sincronizar contatos do WhatsApp"** que dispara `syncInstanceContactsFn` para cada `whatsapp_instance` conectada do workspace, mostrando toast com totais.
- `useEffect` na primeira montagem: se existem conversas com `is_resolved=false` E nenhuma sincronização nas últimas 10min, dispara automaticamente em background (sem bloquear UI).
- `crm-phone.ts`: ajustar `formatPhone` para mostrar **"Aguardando sincronização…"** em vez de "Identificando…" quando o telefone tem 15+ dígitos, para deixar claro a próxima ação.

### 5. Auto-sync periódico

Adicionar tick em `src/routes/api/public/crm.tick.ts` (sem auth, mas protegido por header `x-cron-secret`) que para cada usuário com conversas pendentes >30min roda `syncInstanceContactsFn` em cada instância conectada. Agendar no Supabase via `pg_cron` a cada 15min (mesma estratégia do `agenda-dispatch-every-minute`).

## Resultado esperado

- Conversas presas em "Identificando…" passam a mostrar o nome real e o telefone correto após 1 clique no botão (ou ~15min via cron).
- Novas mensagens `@lid` são resolvidas **na própria inserção** (trigger BEFORE INSERT consulta o cache), sem ficar "identificando".
- Foto e pushName ficam populados automaticamente.

## Referências

- Evolution API `POST /chat/findChats/{instance}` — retorna `remoteJid` + `remoteJidAlt` (PR #1955 do Evolution).
- Evolution API `POST /chat/findContacts/{instance}` — já usado parcialmente, ampliado para popular `pushName`/`profilePicUrl`.
- Tracking issue `@lid vs @jid` — github.com/EvolutionAPI/evolution-api/issues/1872.

Posso seguir?