## Objetivo

Reestruturar os planos com limites mais agressivos pra incentivar upgrade, dar trial Pro de 10 dias sem cartão, e bloquear ações sensíveis (disparos, conexão de chips) quando o trial expira — mantendo o histórico e CRM acessíveis.

## 1. Banco de dados

### Atualizar planos existentes

| Slug | Nome | Preço/mês | Chips | Msgs/dia | Campanhas ativas | Contatos/lista | CRM agentes | Warmup |
|------|------|-----------|-------|----------|------------------|----------------|-------------|--------|
| starter | Starter | R$ 49 | **1** | 1.000 | 1 | 500 | 1 | desligado |
| pro | Pro | R$ 149 | **3** | 5.000 | 5 | 5.000 | 5 | básico |
| scale | Scale | R$ 399 | **20** | 25.000 | ilimitado | ilimitado | ilimitado | avançado |

- Renomeia `enterprise` → `scale` (slug + nome + descrição).
- Adiciona colunas em `subscription_plans`: `max_active_campaigns int`, `max_contacts_per_list int`, `max_crm_agents int`, `warmup_tier text` (`off|basic|advanced`). Valor `-1` = ilimitado.
- Atualiza `description` com features e limites visíveis.

### Trial de 10 dias no Pro

- Altera `handle_new_user()`: trial de **10 dias** (hoje são 7) já no plano Pro, `status='trialing'`, sem cartão.
- Adiciona coluna `trial_ends_at timestamptz` em `subscriptions` (hoje não existe; o code já tentou ler).
- Cron diário (`pg_cron`) que muda `status` de `trialing` → `past_due` quando `trial_ends_at < now()` e não há `efi_subscription_id`.

### Helper de enforcement

Função `public.get_user_plan_limits(_user uuid)` retorna json com todos os limites efetivos do usuário (junta `subscriptions` + `subscription_plans`). Usada pelas server functions e edge functions de disparo.

Função `public.user_can_act(_user uuid, _action text)` retorna boolean. `_action` ∈ `connect_chip`, `send_campaign`, `create_campaign`. Retorna `false` se status é `past_due`/`canceled`/`incomplete`.

## 2. Backend: enforcement

### Server functions a atualizar

- `src/lib/billing.functions.ts` — adicionar `getPlanLimitsFn` que retorna limites + uso atual (chips conectados, campanhas ativas, etc).
- Server fn de criar campanha → checa `user_can_act('create_campaign')` + `max_active_campaigns`.
- Server fn de conectar instância WhatsApp → checa `max_chips` vs `whatsapp_instances` ativas + `user_can_act('connect_chip')`.
- Server fn de adicionar contato à lista → checa `max_contacts_per_list`.
- Edge functions de envio (campanha, warmup) → bail-out se `user_can_act('send_campaign') = false`.

Todas retornam erro tipado `{ error: "plan_limit_exceeded", limit_type, current, max }` pra UI tratar.

## 3. UI

### Página de billing (`/app/billing`)

- Card "Seu plano" no topo já existe — adiciona barra de progresso de uso: `Chips: 1/3`, `Campanhas: 2/5`, `Mensagens hoje: 800/5000`.
- Banner amarelo quando `trialing` e faltam ≤ 3 dias: "Seu trial Pro acaba em X dias".
- Banner vermelho quando `past_due`: "Trial expirado. Disparos e novos chips bloqueados — assine pra continuar".
- Comparativo dos 3 planos com tabela de features (✓/✗) embaixo dos cards, deixando óbvio o que cada um libera.

### Bloqueios visuais (soft block)

- Botão "Conectar novo chip" desabilitado com tooltip "Limite do Starter: 1 chip. Faça upgrade" quando atingiu `max_chips`.
- Botão "Criar campanha" desabilitado quando atingiu `max_active_campaigns` ou `past_due`.
- Modal "Limite atingido" com CTA "Ver planos" sempre que o backend retorna `plan_limit_exceeded`.
- CRM, histórico, contatos continuam navegáveis mesmo em `past_due`.

### Hook `usePlanLimits()`

Centraliza leitura dos limites + uso pra todos os componentes consultarem (`canConnectChip`, `canCreateCampaign`, `daysLeftInTrial`, `isTrialExpired`).

## 4. Landing page (`/`)

- Atualiza seção `Pricing` com os novos limites e renomeia Enterprise → Scale.
- Adiciona linha "10 dias grátis no Pro, sem cartão" no hero/CTA principal.
- Tabela comparativa de features deixando evidente o que tem em cada tier.

## 5. Ordem de execução

1. Migration: novas colunas + rename + update de dados + função de limites + cron + trigger atualizado.
2. Server functions de enforcement.
3. Hook `usePlanLimits` + componentes de bloqueio.
4. UI da billing com barras de progresso e banners.
5. Landing atualizada.

## Detalhes técnicos

- O cron de expiração roda 1x/dia via `pg_cron`; sem ele, o trial só "expira" quando o usuário acessa (fallback no `get_user_plan_limits`).
- `whatsapp_instances` já existe (34 colunas) — uso atual de chips = count de instâncias com `status='connected'`.
- Warmup tier `off` desabilita o botão "Aquecimento" inteiro no Starter.
- Edge functions PIX/cartão já fazem upsert do `plan_id` com status=`active` — basta limpar `trial_ends_at` no upsert pra parar o cron de derrubar a conta paga.
