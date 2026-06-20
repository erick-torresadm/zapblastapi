
# Plano — Cupons, Plano Manual, CRM, Performance, Convites e UX

Como pediu "você prioriza", organizei em **4 fases** por impacto (valor pro usuário × risco). Tudo é entregue, mas em ondas para validar cada etapa.

---

## Fase 1 — Monetização: Cupons + Plano Manual (Admin)

### 1.1 Sistema de Cupons
Nova tabela `coupons` e `coupon_redemptions`:

- **Tipos**: `percent` (0–100%), `fixed` (centavos em R$), `free` (zera 100% e ativa plano X por Y dias)
- **Campos**: `code` (único, uppercase), `type`, `value`, `plan_id` (opcional — restringe a um plano), `free_duration_days` (para tipo `free`), `expires_at`, `max_redemptions` (total), `max_per_user`, `active`, `created_by`
- **Resgates**: `coupon_redemptions` (cupom, user, valor aplicado, subscription_id, data)

**Telas:**
- `/app/admin/cupons` (admin): listar, criar, editar, desativar, ver resgates
- No checkout (`/app/billing` e dialogs PIX/Cartão): campo "Tenho cupom" → valida via server fn `validateCoupon`, mostra preço final, aplica no momento do pagamento
- Cupons tipo `free` pulam o gateway e ativam a subscription direto via `applyFreeCoupon` (server fn, audit log)

**Server fns** em `src/lib/coupons.functions.ts`:
- `validateCoupon({ code, plan_id })` → retorna `{ valid, discount_cents, final_cents, type, message }`
- `redeemCoupon({ code, plan_id, payment_intent_id? })` (auth required)
- `applyFreeCoupon({ code, plan_id })` (auth, cria subscription `active` com `current_period_end = now + free_duration_days`)
- Admin: `createCoupon`, `updateCoupon`, `listCoupons`, `listRedemptions` (gate `_admin`, registra em `admin_audit_log`)

### 1.2 Atribuir Plano Manualmente (Pagamento Fora)
Em `/app/admin/usuarios` (ou na página de detalhes do user) adicionar ação **"Ativar plano (pago fora)"**:

- Form: usuário (busca por email), plano, duração (1/3/6/12 meses ou custom), valor pago, método (PIX externo / dinheiro / outro), nota
- Cria/atualiza `subscriptions` com `status='active'`, `current_period_start=now`, `current_period_end=now+duração`
- Insere em `wallet_transactions` (tipo `topup` com descrição "Pagamento externo — <método> — <nota>") + `admin_audit_log` (`action='manual_plan_grant'`)
- Server fn `grantManualPlan` com `requireSupabaseAuth` + `has_role('admin')`

---

## Fase 2 — CRM: telefones @lid, nome e foto

### 2.1 Resolver @lid → telefone real
Já existe `lookup_lid_phone()`. Ajustes:

- Trigger em `chat_messages` antes do upsert da conversa: se `contact_phone` parece ser @lid (ou veio do JID @lid), chama `lookup_lid_phone` e substitui por número real quando encontrado
- Backfill: server fn admin `backfillLidPhones` percorre `crm_conversations` com phones inválidos e re-resolve
- Exibição: helper `formatContactPhone()` no front que esconde @lid e mostra "Resolvendo..." quando ainda não temos

### 2.2 Nome e foto do contato (via Evolution API)
Nova tabela `crm_contacts_profile` (cache):
- `owner_user_id`, `instance_id`, `contact_phone` (PK composta), `push_name`, `verified_name`, `profile_pic_url`, `profile_pic_fetched_at`, `updated_at`

**Fontes (cascata):**
1. `push_name` que já vem no webhook (`raw_payload.data.pushName`) → grava no cache
2. Endpoint Evolution `/chat/fetchProfilePictureUrl/{instance}` para foto
3. Endpoint Evolution `/chat/findContacts/{instance}` para nome verificado/business

**Server fn** `refreshContactProfile({ instance_id, phone })` chamada:
- Sob demanda (ao abrir conversa, se cache > 24h)
- Em lote diário (cron `refresh-stale-profiles` para conversas ativas)

**UI**: `ContactPanel.tsx` e lista de conversas usam `push_name || verified_name || phone` e `profile_pic_url` (com fallback nas iniciais atuais).

---

## Fase 3 — Convite por link na Equipe + Performance

### 3.1 Convite por link (sem SMTP)
Em `/app/team` adicionar aba **"Link de convite"** ao lado do convite por e-mail:

- Tabela `crm_invite_links`: `owner_user_id`, `token` (random 32 chars), `role` (`agent`/`admin`), `max_uses`, `uses`, `expires_at`, `active`
- Owner gera link `https://<app>/convite/{token}` → copia/compartilha por WhatsApp
- Rota pública `/convite/$token` mostra "Você foi convidado por X". Se logado: aceita e vira `crm_agent`. Se não: login/cadastro e depois aceita
- Server fns: `createInviteLink`, `revokeInviteLink`, `acceptInviteLink({ token })`

### 3.2 Performance (delay no clique)
Diagnóstico + correções já mapeadas:

- Auditar `onAuthStateChange` (deve estar filtrado para SIGNED_IN/OUT/USER_UPDATED — checar se não está disparando `invalidateQueries` em TOKEN_REFRESHED)
- Reduzir invalidações globais: trocar `queryClient.invalidateQueries()` sem chave por invalidações por `queryKey`
- Adicionar `staleTime` razoável (30s–2min) em queries de listagem (chips, campanhas, conversas)
- Remover `realtime` subscriptions duplicadas (uma por componente é comum) → centralizar em hook único por canal
- Loaders pesados (admin/catalog, security): paginação real (limite 50, cursor) em vez de fetch tudo
- Memoizar listas grandes (`React.memo` + `useMemo` em rows de conversa/campanha)
- Code-split rotas pesadas (admin) — já é automático via TanStack, validar bundle

---

## Fase 4 — UX: Bot (Palavras-chave) e Fluxo

### 4.1 Bot (`/app/keywords`)
Reorganizar a página em **seções com tabs/cards claros**:

- **Topo**: switch global "Bot ativo" + estatísticas (gatilhos disparados hoje/semana)
- **Tab "Gatilhos"**: tabela limpa com colunas: Palavra-chave, Tipo de match (exata/contém/regex), Ação (responder texto / iniciar fluxo / encaminhar), Status, Disparos
- **Tab "Configurações"**: horário de atendimento, mensagem padrão fora do horário, ignorar grupos, anti-loop
- **Tab "Histórico"**: `flow_keyword_audit` paginado
- Botão "Novo gatilho" abre dialog em etapas (1. palavra → 2. tipo → 3. ação → 4. revisar)
- Ícones consistentes (lucide), badges de status coloridos, ordenação/busca

### 4.2 Fluxo (`/app/flows/$id`)
Pediu "no fluxo ajuste" mas não detalhou. Vou propor melhorias padrão:

- Sidebar de blocos categorizada (Mensagens / Lógica / Integrações / IA)
- Mini-mapa do fluxo
- Validação visual: blocos sem conexão ficam destacados em amarelo
- Painel direito com propriedades do bloco selecionado (em vez de modal)
- Botão "Testar fluxo" que simula uma conversa

> **Se quiser ajustes específicos no Fluxo**, me diga depois — implemento como hotfix.

---

## Detalhes técnicos resumidos

**Novas tabelas (Fase 1–3)**:
`coupons`, `coupon_redemptions`, `crm_contacts_profile`, `crm_invite_links`

**Novos arquivos principais**:
- `src/lib/coupons.functions.ts`, `src/lib/admin-plans.functions.ts`
- `src/lib/crm-profile.functions.ts`, `src/lib/invites.functions.ts`
- `src/routes/_authenticated/_admin.app.admin.coupons.tsx`
- `src/routes/_authenticated/_admin.app.admin.users.tsx` (se não existir)
- `src/routes/convite.$token.tsx` (rota pública)
- Refatoração: `src/routes/_authenticated/app.keywords.tsx`, `app.team.tsx`, `app.flows.$id.tsx`

**Segurança**: todas as ações de admin passam por `has_role('admin')` + `log_admin_action`. Cupons validados sempre server-side. Convites com token random + expiração + revogação.

---

## Ordem de execução

1. **Agora (Fase 1)**: migrations de cupons + plano manual, server fns, telas admin, integração no checkout
2. **Depois (Fase 2)**: migration `crm_contacts_profile`, integração Evolution, resolver @lid, UI
3. **Depois (Fase 3)**: convites por link + auditoria/correção de performance
4. **Por último (Fase 4)**: redesign Bot + ajustes Fluxo

Confirma que faço nessa ordem? Se quiser **inverter** alguma fase ou **soltar antes** (ex: performance primeiro porque incomoda já), é só dizer.
