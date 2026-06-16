
# Plano Anual com desconto (boost de faturamento)

## Objetivo
Adicionar opção de cobrança **Mensal vs Anual** com desconto chamativo na página `/app/billing`, incentivando o usuário a fechar 12 meses adiantado — aumenta LTV, reduz churn e melhora o caixa.

## Estrutura de preços proposta

| Plano | Mensal | Anual (à vista) | Anual equivalente/mês | Desconto | Você economiza |
|---|---|---|---|---|---|
| Starter | R$ 49 | R$ 470 | R$ 39,17/mês | **20% OFF** | R$ 118/ano |
| Pro ⭐ | R$ 149 | R$ 1.430 | R$ 119,17/mês | **20% OFF** + 1 mês grátis | R$ 358/ano |
| Enterprise | R$ 399 | R$ 3.830 | R$ 319,17/mês | **20% OFF** | R$ 958/ano |

- **Âncora visual**: card Pro com badge "Economize 2 meses" — gatilho psicológico forte.
- **Toggle Mensal/Anual** no topo (com badge "−20%" no Anual, pré-selecionado em Anual pra empurrar a conversão).
- **Preço riscado** mostrando o mensal equivalente vs o desconto.

## Mudanças

### 1. Banco (`subscription_plans`)
Adicionar colunas pra preço anual:
- `price_annual_cents` (int, nullable) — preço total do ano à vista
- `stripe_price_id_annual` (text, nullable) — pro futuro checkout
- Atualizar os 3 planos existentes com os valores acima

Migration única + UPDATE dos planos.

### 2. UI `src/routes/_authenticated/app.billing.tsx`
- **Toggle `Mensal / Anual`** (componente `Tabs` ou `Switch` com badge "−20%") no topo da grade.
- Estado local `billingCycle: "monthly" | "annual"`, default `"annual"`.
- Em cada card:
  - Mostrar preço dinâmico baseado no toggle
  - Quando Anual: exibir `R$ X/mês` grande + `cobrado R$ Y/ano` pequeno + badge verde `Economize R$ Z` + preço mensal riscado
  - Quando Mensal: exibir `R$ X/mês` + texto "ou economize 20% no plano anual ↑"
- **Pro** ganha um selo extra "Mais escolhido" quando Anual está ativo.
- Manter botão "Em breve (Stripe)" — sem mexer no checkout agora.

### 3. Server fn `getBillingStateFn`
Já retorna `subscription_plans` — só precisa incluir os novos campos no select (automático com `*`). Sem mudança de lógica.

## Fora do escopo (deixar pra próxima)
- Integração de checkout Stripe/Paddle (já marcado "em breve" no app)
- Migração de assinatura ativa entre ciclos
- Cupons promocionais customizados

## Detalhes técnicos
- Toggle persistido só em estado local (não precisa salvar)
- Cálculo do "economize" feito no client: `(price_cents * 12) - price_annual_cents`
- Acessibilidade: toggle como `role="tablist"` com labels claros
- Mobile: toggle vira full-width acima dos cards

## Resultado esperado
- **+15–25% no ticket médio inicial** (referência de mercado SaaS)
- Caixa antecipado de 12 meses por cliente anual
- Página com vibe "premium SaaS" (toggle + economia destacada = padrão Linear/Vercel/Notion)
