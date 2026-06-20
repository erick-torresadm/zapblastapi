## Reconstrução do CRM — Perseidas Inbox

Refazendo o CRM do zero (UX + backend) num padrão profissional estilo Chatwoot, mantendo as features existentes (notas, quick replies, reações, mídia) e resolvendo os 4 bugs estruturais com um worker de background pra resolver `@lid` automaticamente.

---

### Bugs raiz (e como cada um é resolvido)

| Bug | Causa | Correção |
|---|---|---|
| Áudio não toca | `new Audio()` JS + falta de transcoding `.ogg/opus` (Safari/iOS não tocam) | `<audio controls>` nativo com `<source>` múltiplo + transcoding server-side opcional + waveform real via WaveSurfer.js |
| Foto não aparece | Avatar só busca quando clica "Sincronizar"; URL da Evolution expira | Worker baixa foto, salva em storage `crm-avatars/{owner}/{phone}.jpg` na 1ª mensagem; refresh a cada 7 dias |
| Número desordenado | Chega `@lid` (LinkedID criptografado), trigger falha silenciosa, vira "telefone" de 15+ dígitos | Coluna `is_resolved` boolean + worker que tenta resolver via `fetchProfile` na Evolution; UI mostra "Resolvendo…" enquanto pendente |
| Conversas erradas/duplicadas | Mesmo contato em 2 linhas (uma `@lid`, outra real); falta filtro de grupo/broadcast | Job de merge quando @lid resolve para número que já existe (merge mensagens + apaga duplicata); filtro fixo `chat_type='user'` na inbox |

---

### Nova arquitetura visual (3 painéis, layout fluido)

```text
┌─────────┬───────────────────────────────┬─────────────┐
│ Sidebar │ Inbox (conversas)             │ Conversa    │
│ filtros │ ┌───────────────────────────┐ │ ┌─────────┐ │
│         │ │ Search + filtros chip     │ │ │ Header  │ │
│ • Tudo  │ ├───────────────────────────┤ │ │ contato │ │
│ • Mine  │ │ [avatar] Nome    12:34 ✓✓ │ │ ├─────────┤ │
│ • Fila  │ │ Última mensagem...    (3) │ │ │         │ │
│ • Não   │ │ #vendas #lead             │ │ │  Chat   │ │
│   lidas │ ├───────────────────────────┤ │ │         │ │
│ • Snooze│ │ ...                       │ │ ├─────────┤ │
│ • Arq.  │ │                           │ │ │ Compose │ │
│         │ │                           │ │ └─────────┘ │
│ Labels  │ │                           │ │             │
│ • Lead  │ │                           │ │ [Aba: Info  │
│ • VIP   │ │                           │ │  Notas      │
│         │ │                           │ │  Histórico] │
└─────────┴───────────────────────────────┴─────────────┘
```

- **Sidebar esquerda fixa** (200px): filtros + labels personalizados (multi-select)
- **Lista de conversas** (340px): item denso com avatar real, nome, preview, badge unread, timestamp relativo, ícones de status (pin, mute, archived, snoozed), tags como chips
- **Chat central** (flex): header com avatar grande + presença real, mensagens com bubble redesenhada, compose com toolbar fixa
- **Painel direito retrátil** (320px): abas **Info | Notas | Histórico | Pedidos**

Design system: usa tokens existentes (`bubble-in`, `bubble-out`, `chat-quoted-border`). Acentos verdes (success), badge vermelho (unread), avatar com ring colorido pelo status.

---

### Mudanças de backend (DB)

**Migration única** com:

1. **`crm_conversations`**:
   - `is_resolved boolean DEFAULT false` — false enquanto @lid pendente
   - `resolve_attempts int DEFAULT 0` — backoff exponencial
   - `next_resolve_at timestamptz` — próximo agendamento
   - `snoozed_until timestamptz` — snooze (esconder até data)
   - `label_ids uuid[] DEFAULT '{}'` — labels custom
   - índice parcial `WHERE NOT is_resolved` pro worker

2. **`crm_labels`** (nova tabela):
   - `id, owner_user_id, name, color, created_at`
   - RLS owner-scoped, GRANTs corretos

3. **`crm_avatars` (bucket de storage)**:
   - bucket privado; foto baixada pelo worker; URL via signed URL 24h cacheada client-side

4. **RPC `crm_merge_conversations(src_id, dst_id)`**:
   - move mensagens, notas, atualiza referências, apaga src
   - SECURITY DEFINER; só chama quando worker confirma que src.phone == dst.phone após resolve

5. **Trigger `chat_messages_after_insert`** (refatorada):
   - dispara `pg_notify('crm_resolve', conv_id)` quando insere com @lid pendente
   - mantém upsert de conversa, mas marca `is_resolved=false` quando phone bate regex `^[0-9]{15,}$` ou JID termina em `@lid`

---

### Worker de resolução em background

**TanStack server route público** (`/api/public/crm/resolve-pending`) chamado por pg_cron a cada **1 minuto**:

```sql
SELECT cron.schedule('crm-resolve-pending', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://zapblastapi.lovable.app/api/public/crm/resolve-pending',
    headers := jsonb_build_object('Content-Type','application/json','apikey','<anon>'),
    body := '{}'::jsonb
  );
$$);
```

Handler:
1. SELECT até 50 conversas com `is_resolved=false AND next_resolve_at <= now()`
2. Para cada uma: `fetchProfile` + `fetchProfilePictureUrl` na Evolution
3. Se resolveu número → baixa avatar, salva em `crm-avatars/`, faz upsert; se já existe conversa com mesmo número, chama `crm_merge_conversations`
4. Se falhou: `resolve_attempts++`, `next_resolve_at = now() + interval '5 min' * 2^attempts` (máx 24h, cap em 10 tentativas)

Autenticado via `apikey` header (padrão pg_cron Lovable).

---

### Player de áudio (resolve "não toca")

Componente `<AudioMessage>`:
- `<audio>` nativo com `preload="metadata"`, `crossOrigin="anonymous"`
- WaveSurfer.js (`bun add wavesurfer.js`) renderiza waveform real, sincroniza com `<audio>`
- Detecta MIME → se for `audio/ogg; codecs=opus` e Safari, usa fallback via `<source>` apontando para `transcoded_url` (lazy transcoding com `@ffmpeg/ffmpeg` WASM client-side, gerando MP3 sob demanda quando dá erro)
- Velocidade (1x/1.5x/2x), barra de progresso clicável

---

### Avatar com cache real

- Server fn `getContactAvatarFn(conversation_id)` retorna signed URL do `crm-avatars/`
- Se não existir storage path, dispara `fetchProfilePictureUrl` síncrono e cacheia
- Worker mantém atualizado a cada 7 dias

---

### Estrutura de arquivos (limpeza)

Remover/renomear (arquitetura plana atual):
- `src/lib/chat.functions.ts` → fundir em `src/lib/crm/messages.functions.ts`
- `src/lib/crm.functions.ts` → quebrar em `src/lib/crm/{conversations,agents,notes,labels}.functions.ts`
- `src/lib/crm-media.functions.ts` → `src/lib/crm/media.functions.ts`
- `src/lib/crm-profile.functions.ts` → `src/lib/crm/profile.functions.ts`

Novos:
- `src/routes/api/public/crm.resolve-pending.ts` — worker
- `src/lib/crm/labels.functions.ts` — CRUD de labels
- `src/lib/crm/resolve.server.ts` — lógica de resolução (server-only)

Componentes novos em `src/components/crm/`:
- `Inbox.tsx`, `InboxSidebar.tsx`, `ConversationList.tsx`, `ConversationItem.tsx`
- `ChatHeader.tsx`, `ChatThread.tsx`, `Composer.tsx`
- `ContactPanel.tsx` (refatorado, com abas), `LabelPicker.tsx`
- `AudioMessage.tsx` (substitui `AudioPlayer`)
- `Avatar.tsx` (componente único, usa cache)

Mantidos: `MessageBubble.tsx`, `DateSeparator.tsx`, `MediaPreviewDialog.tsx`, `ReplyPreview.tsx`, `EmptyChatState.tsx` (ajustes pontuais)

Rota: `app.inbox.tsx` vira fino, só monta `<Inbox />`.

---

### Ordem de implementação

1. **Migration DB** (worker fields, labels, RPC merge, trigger refactor, pg_cron)
2. **`bun add wavesurfer.js`**
3. **Worker route** `/api/public/crm/resolve-pending` + server helpers
4. **Avatar cache** (server fn + storage upload via worker)
5. **Novos componentes** (Inbox, Sidebar, ConversationItem, ChatHeader, Composer, ContactPanel com abas, AudioMessage, Avatar)
6. **Refactor de `src/lib/crm/*`** (split em módulos)
7. **`app.inbox.tsx`** vira shell de `<Inbox />`
8. **Validação**: Playwright + screenshots da inbox carregando, áudio tocando, avatar real, número formatado

---

### Detalhes técnicos importantes

- **RLS** mantida em todas as novas tabelas; `crm_labels` scoped por `owner_user_id`
- **GRANTs** completos (authenticated + service_role)
- **Realtime** continua via canal `crm-{workspace}` mas agora também escuta `crm_labels`
- **Worker é idempotente**: se conversa já resolveu entre o SELECT e o UPDATE, ignora
- **Sem quebra de dados**: conversas existentes ganham `is_resolved=true` quando `contact_phone` bate `^[0-9]{10,14}$`, senão `false` (worker pega na próxima rodada)
- **Frontend não conhece o worker**: query da inbox tem `refetchInterval: 15s`, então conversas resolvidas aparecem sozinhas; opcional realtime trigger via `pg_notify` (fase 2)
- **Performance**: índice parcial `crm_conversations(next_resolve_at) WHERE NOT is_resolved` mantém worker rápido mesmo com 100k conversas

---

### Fora do escopo (próxima rodada se você pedir)

- Pipeline kanban arrastável (deals/oportunidades)
- Atribuição automática por regras (round-robin, por label)
- SLA + métricas (tempo de primeira resposta, tempo de resolução)
- Integração com pedidos/produtos do e-commerce
- Bot/IA respondendo automaticamente

Quero deixar essa fundação 100% sólida antes de empilhar mais features.
