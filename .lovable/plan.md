## Objetivo
Transformar a ferramenta **Google Maps Leads** num funil de prospecção que prende o usuário na plataforma: dar buscas grátis gatilhadas por cupons (uso limitado), forçar o caminho "Maps → Disparador" para quem é grátis, e liberar download de números só para quem pagou.

---

## 1. Novo tipo de cupom: `tool_credits` (buscas grátis)

Estender `public.coupons` com 2 colunas:
- `tool_scope text` — `'maps_search'` (futuro: `'unsaved'`, `'validator'`).
- `tool_free_uses int` — quantas buscas o cupom concede ao ser resgatado.

Nova tabela `public.tool_credits`:
- `user_id`, `tool` (`maps_search`), `remaining int`, `source` (`coupon`/`plan`/`admin`), `coupon_id?`, `expires_at?`.
- RLS: usuário lê o próprio; service_role escreve.
- Função `consume_tool_credit(_tool text) returns boolean` (SECURITY DEFINER) — decrementa 1 se houver, retorna `true`.
- Função `redeem_tool_credit_coupon(_code text)` — valida cupom (reusa `validate_coupon`), cria linha em `tool_credits` com `remaining = tool_free_uses` e incrementa `redemptions_count`.

Plano também pode dar uso recorrente: adicionar coluna `monthly_free_maps_searches int default 0` em `subscription_plans` e job leve (no próprio `consume_tool_credit`) que repõe mensalmente via linha `source='plan'` com `expires_at = now()+30d`.

---

## 2. Gating no `searchMapsLeadsFn`

Ordem nova de cobrança:
1. Tenta `consume_tool_credit('maps_search')`. Se `true` → busca **grátis**, flag `used_free=true`.
2. Senão, faz `debit_wallet` como hoje.
3. Refund continua igual (sem leads → reembolsa, seja crédito ou saldo: se foi crédito, devolve +1 em `tool_credits`).

Retorno passa a incluir:
- `used_free: boolean`
- `can_download: boolean` — `true` quando pagou com saldo; `false` quando consumiu crédito grátis.
- `free_remaining: number` — saldo de buscas grátis restantes.

---

## 3. UX do extrator: "Enviar pro disparador" como caminho principal

No `MapsExtractorCard` (painel de resultados):
- **Sempre visível, em destaque** (botão primary grande): **"Enviar para campanha"** →
  - Cria `contact_list` + `contacts` (apenas leads com telefone, normalizados) via novo `pushMapsLeadsToListFn`.
  - Redireciona para `/app/campaigns/new?list_id=...` com a lista já selecionada.
- **Botão CSV** fica condicionado a `can_download`:
  - `used_free === true` → CSV substituído por badge "Download de CSV disponível ao pagar a busca" + link "Comprar saldo".
  - `used_free === false` → CSV normal.
- Cabeçalho do card mostra: `"X buscas grátis restantes • Y leads/mês no seu plano"` quando houver créditos; senão preço como hoje.
- Banner pequeno quando `used_free`: "Esta busca foi gratuita. Os números ficam disponíveis para disparo dentro da plataforma — para baixar o CSV, faça uma busca paga."

---

## 4. Admin: criar cupom de buscas grátis

Em `/app/admin/coupons`:
- Novo tipo no select: **"Buscas grátis (ferramenta)"**.
- Campos extras: `tool_scope` (default `maps_search`) e `tool_free_uses` (qtd).
- Listagem mostra coluna "Concede" com ex.: `5 buscas no Maps`.

---

## 5. Resgate pelo usuário

Na tela `/app/tools` (aba Maps), card no topo:
- Input "Tenho um cupom" → chama `redeem_tool_credit_coupon` → toast "Você ganhou 5 buscas grátis no Google Maps" → invalida query e atualiza contador.
- (Pode reaproveitar o componente `CouponField` adaptando para resposta de créditos.)

---

## 6. Estratégia "preender o usuário" (resumo do fluxo)

```text
Marketing YouTube
   ↓
Usuário cria conta (trial 10d já existente)
   ↓
Resgata cupom YT-XYZ → ganha 5 buscas grátis no Maps
   ↓
Faz busca → vê leads na tela MAS sem CSV
   ↓
Único caminho útil: "Enviar para campanha" → /app/campaigns/new
   ↓
Para disparar, precisa de chip conectado + plano ativo
   ↓
Quer baixar números? → Compra saldo → busca paga libera CSV
```

---

## Detalhes técnicos

**Migration 1** — colunas em `coupons` + `subscription_plans`:
```sql
ALTER TABLE public.coupons
  ADD COLUMN tool_scope text,
  ADD COLUMN tool_free_uses int DEFAULT 0;

ALTER TABLE public.subscription_plans
  ADD COLUMN monthly_free_maps_searches int NOT NULL DEFAULT 0;
```

**Migration 2** — `tool_credits` + funções (com GRANT a `authenticated`/`service_role`, RLS `auth.uid() = user_id` em SELECT, sem INSERT/UPDATE direto; mutação só via RPC SECURITY DEFINER).

**Arquivos novos/alterados**:
- `supabase/migrations/<ts>_tool_credits.sql`
- `src/lib/tool-credits.functions.ts` — `getToolCreditsFn`, `redeemToolCreditCouponFn`, `pushMapsLeadsToListFn`.
- `src/lib/maps.functions.ts` — integra `consume_tool_credit` antes do `debit_wallet`; devolve `used_free`, `can_download`, `free_remaining`.
- `src/components/tools/MapsExtractorCard.tsx` — botão "Enviar para campanha", CSV condicional, contador de grátis, campo de cupom.
- `src/routes/_authenticated/_admin.app.admin.coupons.tsx` — suporte ao novo tipo.
- `src/integrations/supabase/types.ts` — regenerado após migration.

**Fora de escopo desta rodada** (avisar usuário):
- Aplicar mesma lógica a "Não salvos" e "Validador" (estrutura está pronta, basta replicar `consume_tool_credit` mudando o `tool`).
- Crédito mensal automático no virar do mês (vai usar `expires_at + lazy refill` no consume, sem cron).