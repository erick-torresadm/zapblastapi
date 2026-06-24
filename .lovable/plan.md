# Planos customizáveis + correção de limites não vinculados

## 1. O bug atual

Hoje os limites são lidos da RPC `get_user_plan_limits`, que junta `subscriptions` com `subscription_plans`. Quando você tem plano Scale ativo, o sistema **deveria** liberar 20 chips e ~10 campanhas — mas está bloqueando. Causas prováveis (vou diagnosticar em runtime no primeiro passo):

- A sua `subscription` (a do grant manual) está com `plan_id` apontando pra outro plano (ex.: Pro com 3 chips) ou com `status` que não passa em `can_act`.
- A contagem de chips usa `status IN ('connected','open','connecting')` — chips zumbis em `connecting` consomem slot. Vou trocar pra contar só `connected/open` (descartar `connecting` antigo > 5min).
- A flag `can_act` exige status `active|trialing`; um grant manual antigo pode ter ficado em `past_due`. Vou garantir que `grant_manual_plan` sobrescreve status pra `active` e zera `trial_ends_at`.

## 2. Tornar o plano 100% customizável (admin)

### 2a. Schema — novas colunas em `subscription_plans`

Já existem: `max_chips`, `max_messages_per_day`, `max_active_campaigns`, `max_contacts_per_list`, `max_crm_agents`, `warmup_tier`, `monthly_free_maps_searches`, `has_agenda`, `price_cents`, `price_annual_cents`.

Adicionar (todas com default sensato; `-1` = ilimitado quando aplicável):

- `max_contact_lists INT` — quantas listas
- `max_flows INT` — fluxos do construtor
- `max_traffic_funnels INT` — funis de tráfego
- `max_agenda_businesses INT`
- `max_group_campaigns INT`
- `feature_flags JSONB` — toggles booleanos por ferramenta, ex.:
  ```json
  {
    "campaigns": true, "crm": true, "flows": true, "warmup": true,
    "agenda": true, "traffic_funnels": true, "group_campaigns": true,
    "tools_maps": true, "tools_unsaved_contacts": true,
    "csv_export": true, "api_access": false
  }
  ```
- `visible_public BOOLEAN` — se aparece na tela pública de billing (planos custom como "Los Angeles" podem ser ocultos e atribuídos só por grant manual).

### 2b. RPC `get_user_plan_limits` — retornar tudo

Estender o JSON com as novas colunas + `feature_flags`. Manter retrocompat dos campos atuais.

### 2c. Hook `usePlanLimits` — expor helpers

Adicionar:
- `canUseFeature(key: string): boolean` — lê `feature_flags[key]`, fallback true.
- `canCreateList`, `canCreateFlow`, `canCreateFunnel`, `canCreateAgenda`, `canCreateGroupCampaign` — todos com contagem atual vs. limite (RPC já passa a devolver o uso).
- `limitOf(key)` / `usageOf(key)` genéricos.

### 2d. Página `/app/admin/plans`

Nova rota `src/routes/_authenticated/_admin.app.admin.plans.tsx`. UI:

- Tabela listando planos (slug, nome, preço mensal, preço anual, visível, ativo, ações).
- Botão **Novo plano** abre dialog com formulário completo:
  - Identidade: `slug`, `name`, `description`, `featured`, `sort_order`, `visible_public`, `active`.
  - Preço: `price_cents` (mensal, em R$), `price_annual_cents` (anual, em R$).
  - Limites numéricos (input com checkbox "Ilimitado" que grava `-1`): chips, msgs/dia, campanhas ativas, contatos/lista, agentes CRM, listas, fluxos, funis, agendas, campanhas de grupo, buscas Maps grátis/mês.
  - Warmup: select `off/basic/advanced`.
  - **Feature flags**: grid de checkboxes (Campanhas, CRM, Fluxos, Aquecimento, Agenda, Funis, Grupos, Ferramenta Maps, Contatos não salvos, Exportar CSV, API).
- Editar reabre o mesmo dialog preenchido.
- Excluir só se não houver `subscriptions` apontando pro plano (senão bloqueia com aviso).

### 2e. Server fns — `src/lib/admin-plans.functions.ts`

Adicionar (todas com `requireSupabaseAuth` + `ensureAdmin`):
- `adminListPlansFn()` — lista completa (sem filtro `active`).
- `adminUpsertPlanFn(plan)` — Zod valida; insert ou update.
- `adminDeletePlanFn({ id })` — checa uso, deleta.

## 3. Enforcement em todas as áreas

Onde hoje não bloqueia / bloqueia errado, aplicar gates baseados em `usePlanLimits()` (client) e validações duplas no servidor (lendo da mesma RPC):

| Área | Gate cliente | Gate servidor |
|---|---|---|
| Conectar chip (QR) | `canConnectChip && featureFlags.campaigns` | `instances.functions.ts`: bloquear `connectInstanceFn` se exceder |
| Criar campanha | `canCreateCampaign` | `campaigns.functions.ts`: bloquear create/start |
| Criar lista | `canCreateList` | `contact-lists.functions.ts` |
| Criar fluxo | `canCreateFlow && featureFlags.flows` | `flows.functions.ts` |
| Criar funil | `canCreateFunnel && featureFlags.traffic_funnels` | `traffic.functions.ts` |
| Criar agenda (negócio) | `canCreateAgenda && featureFlags.agenda` | `agenda.functions.ts` |
| Criar campanha de grupo | `canCreateGroupCampaign && featureFlags.group_campaigns` | `group-campaigns.functions.ts` |
| Convidar agente CRM | usage CRM < `max_crm_agents` | `crm-invites.functions.ts` |
| Importar contatos pra lista | tamanho ≤ `max_contacts_per_list` | server import |
| Aquecimento | `featureFlags.warmup && warmup_tier !== 'off'` | server warmup |
| Maps tool / Unsaved tool / CSV export | respectivos `featureFlags` | server fns dessas tools |

Sidebar: itens cujas features estão `false` ficam ocultos (ou aparecem com cadeado + tooltip "Disponível em outro plano").

## 4. Diagnóstico imediato do bug Scale

Antes (ou em paralelo a) qualquer migration, um query rápido na sua subscription pra confirmar `plan_slug`, `status`, `trial_ends_at` e contagem real de chips/campanhas — pra ter certeza que a correção de RPC e o ajuste em `grant_manual_plan` cobrem o sintoma. Se o `plan_id` da sua subscription estiver errado, corrijo via insert/update direto.

## 5. Detalhes técnicos

- **Migration única** com: novas colunas, default JSONB pra `feature_flags` de cada plano existente (Starter/Pro/Scale com flags coerentes), recriação da RPC `get_user_plan_limits`, ajuste em `grant_manual_plan` (forçar `status='active'`, `trial_ends_at=NULL`), correção do COUNT de chips (descartar `connecting` antigo > 5min via `updated_at`).
- **Tipos** regenerados depois da migration; só então escrevo o dialog/admin/page e os gates.
- **Sem mudança visual nos planos públicos** além de respeitar `visible_public`.
- Tudo passa por `has_role('admin')` e gera entrada em `admin_audit_log` (`plan_created`, `plan_updated`, `plan_deleted`).

## Entregáveis
1. Migration com novas colunas, RPC atualizada, fix do grant manual, fix do count de chips.
2. `src/lib/admin-plans.functions.ts` estendida (list/upsert/delete).
3. `src/routes/_authenticated/_admin.app.admin.plans.tsx` com CRUD completo.
4. Link "Planos" no sidebar admin.
5. `usePlanLimits` estendido com `canUseFeature` e novos helpers.
6. Gates aplicados nas server fns e telas listadas em §3.
