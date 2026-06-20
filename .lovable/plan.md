## Group Launcher — Criação em lote + Rotator de link

Nova ferramenta para lançamentos meteóricos no WhatsApp: criar dezenas de grupos de uma vez, distribuir o link público com rotação automática quando enche, e monitorar capacidade em background.

### Conceito (modelo de dados)

```text
group_campaigns          → 1 lançamento (ex: "Black Friday 2026")
  ├─ slug público        → perseidas.app/g/{slug}
  ├─ member_limit (950)  → quando rotacionar
  ├─ default_image, default_description
  └─ instance_id         → qual WhatsApp cria os grupos

group_campaign_links     → cada grupo dentro da campanha
  ├─ campaign_id
  ├─ source: 'created'|'pasted'
  ├─ group_jid           → "5511...-1709...@g.us" (quando criado via Evolution)
  ├─ invite_code         → código de chat.whatsapp.com/{code}
  ├─ invite_url          → URL completa
  ├─ title, position
  ├─ member_count, last_checked_at
  ├─ status: 'pending'|'active'|'full'|'broken'|'archived'
  └─ filled_at
```

### Backend

**Migration**
- Tabelas acima com RLS por `owner_user_id` (mesmo padrão multitenant atual).
- Grants padrão (`authenticated` + `service_role`).
- Índice parcial em `(campaign_id, position) WHERE status='active'` para o rotator escolher rápido.
- RPC `public_get_next_group_link(slug TEXT)` — security definer, sem auth: retorna o próximo `invite_url` ativo, incrementa contador de cliques, marca como "full" se passou do limite.

**Helper Evolution** (`src/lib/evolution.server.ts` — adicionar)
- `createGroup(server, instance, { subject, description, participants[] })` → `POST /group/create/{instance}`
- `fetchInviteCode(server, instance, groupJid)` → `GET /group/inviteCode/{instance}?groupJid=...`
- `updateGroupPicture(server, instance, groupJid, image)` → opcional, para foto
- Já temos `findGroupInfos` (lê member_count) e `inviteInfoGroup` (valida link colado).

**Server functions** (`src/lib/group-launcher.functions.ts`)
- `createCampaign` — cria registro + slug único.
- `bulkCreateGroups({ campaignId, count, subjectTemplate, description, image })` — loop com throttle (1 grupo a cada ~2s pra não tomar ban) chamando Evolution; salva cada grupo + invite_code retornado. Roda **assíncrono** via job table (`group_create_jobs`) processado por cron, para não travar a UI em criações de 50+ grupos.
- `pasteGroupLinks({ campaignId, links[] })` — parse invite_code, valida via `inviteInfoGroup`, insere como `source='pasted'`.
- `reorderLinks`, `archiveLink`, `deleteCampaign`.

**Workers (`/api/public/group-launcher/...`)**
- `tick-create` — pega N jobs `pending` em `group_create_jobs`, cria grupos via Evolution, backoff exponencial em falha.
- `tick-monitor` — para cada link `active`, chama `findGroupInfos`, atualiza `member_count`; se `>= member_limit` marca `full` e promove o próximo `pending` da fila para `active`.
- Ambos agendados via `pg_cron`: create a cada 30s, monitor a cada 2min.

### Frontend

**Rota pública** `src/routes/g.$slug.tsx`
- Server loader chama RPC `public_get_next_group_link`.
- Redirect 302 direto para `https://chat.whatsapp.com/{code}` (sem página intermediária — o usuário pediu só rotator puro nesta fase).
- Fallback: se nenhum link ativo, renderiza "Em breve — fique de olho".

**Painel** `src/routes/_authenticated/app.group-launcher.*`
- `index.tsx` — lista de campanhas (nome, slug público, total de grupos, total de cliques, % ocupação média).
- `$id.tsx` — detalhe da campanha com 3 abas:
  - **Grupos**: tabela com posição, título, status, membros/limite, último check, botão "arquivar". Botão "Reordenar" (drag-and-drop com `@dnd-kit`).
  - **Adicionar**: dois cards — "Criar em lote" (quantidade, template de nome `{n}`, descrição, foto, instância) e "Colar links" (textarea).
  - **Configurações**: slug, limite por grupo, imagem padrão, instância padrão.
- Realtime via Supabase channel para refletir progresso da criação em lote sem refresh.

**Componentes novos**
- `GroupCampaignCard`, `GroupLinkRow`, `BulkCreateForm`, `PasteLinksForm`, `CapacityBar` (barra de progresso colorida).

### Navegação
- Item "Group Launcher" no menu lateral de `app/_authenticated`, ao lado de Campanhas.

### Detalhes técnicos importantes

- **Throttle de criação**: WhatsApp ban risk se criar grupos rápido demais. Limite 1/instância a cada 2s no worker.
- **Slug colisão**: validar único + sugerir alternativa.
- **member_count via Evolution**: `findGroupInfos` retorna `participants[]`, contamos `length`. Cache mínimo 60s para não saturar a API.
- **Race condition no rotator**: RPC usa `FOR UPDATE SKIP LOCKED` ao selecionar o link ativo para evitar dois requests pegarem o mesmo "último slot".
- **Links colados**: valida formato (`/^[A-Za-z0-9_-]{20,24}$/` para invite_code), chama `inviteInfoGroup` para puxar título e marcar `member_count` inicial.
- **Bucket de imagens**: reusar `crm-avatars` ou criar `group-images` privado com URL assinada para a foto do grupo.

### Não está nesta fase (anotado para futuro)
- Captura de lead antes do redirect (você sinalizou que não quer agora).
- Analytics de cliques por origem (UTM) — fácil de adicionar depois sobre a mesma tabela.
- Múltiplas instâncias rotacionando criação em paralelo.

### Arquivos a criar/editar

**Criar**
- `supabase/migrations/<ts>_group_launcher.sql`
- `src/lib/group-launcher.functions.ts`
- `src/routes/g.$slug.tsx`
- `src/routes/_authenticated/app.group-launcher.index.tsx`
- `src/routes/_authenticated/app.group-launcher.$id.tsx`
- `src/routes/api/public/group-launcher.tick-create.ts`
- `src/routes/api/public/group-launcher.tick-monitor.ts`
- `src/components/group-launcher/{GroupCampaignCard,GroupLinkRow,BulkCreateForm,PasteLinksForm,CapacityBar}.tsx`

**Editar**
- `src/lib/evolution.server.ts` (adicionar `createGroup`, `fetchInviteCode`, `updateGroupPicture`).
- Menu lateral do `_authenticated` (adicionar item).
