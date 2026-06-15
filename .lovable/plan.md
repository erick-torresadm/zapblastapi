## Marketplace de Chips Virtuais + Assinatura + Carteira

Nova seção da plataforma onde clientes pagam mensalidade pra acessar o SaaS e mantêm um **saldo pré-pago** pra "comprar" chips virtuais (números BR via API tipo SMS-Activate / 5sim). Quando o chip chega, é provisionado automaticamente como instância no Evolution e aparece na aba **Chips** prontinho pra warmup/disparo.

### Páginas novas

1. **Planos** (`/app/billing`) — escolhe assinatura mensal (ex: Starter R$ 49, Pro R$ 149, Enterprise R$ 399). Vai pro Stripe Checkout, retorna e libera acesso. Mostra status da assinatura e botão "Gerenciar" (Stripe Customer Portal).

2. **Carteira** (`/app/wallet`) — saldo atual + histórico de transações. Botão "Adicionar saldo" abre modal com valores pré-definidos (R$ 50 / R$ 100 / R$ 250 / R$ 500 / outro) → Stripe Checkout → webhook credita.

3. **Marketplace de Chips** (`/app/marketplace`) — catálogo com cards: "Chip BR Descartável — R$ 7,90", "Chip BR Premium — R$ 19,90" (markup configurável sobre o custo do provedor). Botão "Comprar" debita carteira, chama o provedor, cria a instância. Tela inicial vem com tudo "Provedor não conectado" até você ligar a API.

### Fluxo de compra

```
Cliente clica Comprar  →  valida saldo  →  debita carteira (transação atômica)
   →  chama provedor (API stub) pra alocar número
   →  cria evolution_servers (se não tem) e whatsapp_instances  
   →  retorna QR code ou número pronto  →  registra purchase
```

Se a chamada do provedor falhar, **estorna automaticamente** o saldo.

### Schema (Lovable Cloud)

**`subscription_plans`** — tabela seed com nome, preço, stripe_price_id, limites (chips simultâneos, mensagens/dia).

**`subscriptions`** — `user_id`, `plan_id`, `stripe_subscription_id`, `status` (active/past_due/canceled), `current_period_end`. RLS: usuário vê só a sua.

**`wallets`** — `user_id` (unique), `balance_cents`, `total_topped_up_cents`. RLS própria.

**`wallet_transactions`** — `user_id`, `amount_cents` (positivo=crédito, negativo=débito), `type` (topup/purchase/refund/adjustment), `description`, `stripe_payment_intent_id`, `chip_purchase_id`. Imutável (sem update/delete).

**`chip_catalog`** — produtos vendáveis: `name`, `description`, `price_cents`, `provider_cost_cents` (custo seu pra calcular margem), `provider` (sms_activate/5sim/etc), `provider_service_code` (ex: "wa" pra WhatsApp), `country_code` (default 'br'), `active`. Você gerencia via tela de admin.

**`chip_purchases`** — log de cada compra: `user_id`, `catalog_item_id`, `price_paid_cents`, `provider_order_id`, `instance_id` (FK pra `whatsapp_instances` quando provisionado), `status` (pending/provisioning/active/failed/refunded), `phone_number`, `expires_at` (chip virtual tem vida curta).

**`user_roles`** ganha valor `'admin'` (já existe o enum) — admin acessa `/app/admin/catalog` pra editar produtos.

### Integração com provedor (stub plugável)

Crio `src/lib/chip-providers/` com interface comum:

```ts
interface ChipProvider {
  buyNumber(serviceCode: string, country: string): Promise<{ orderId: string; phone: string }>;
  checkStatus(orderId: string): Promise<{ phone: string; smsCode?: string; status: string }>;
  cancelOrder(orderId: string): Promise<void>;
}
```

Implementações vazias pra `sms_activate.ts`, `5sim.ts` e um `mock.ts` que retorna número fake pra você testar a UI antes de conectar provedor real. Quando você escolher e me passar a chave, eu pluga em 5 min.

### Stripe (built-in Lovable)

- **Assinatura** mensal recorrente (3 produtos)
- **Recarga de saldo** como pagamento avulso
- 1 webhook em `/api/public/stripe-webhook` que processa: `checkout.session.completed` (recarga), `customer.subscription.*` (assinatura), `invoice.paid`/`invoice.payment_failed`

### Controle de acesso

Middleware/guard: se assinatura `status != 'active'` e o usuário não é admin, bloqueia acesso a `/app/campaigns/new` e mostra banner "Assinatura inativa — renovar". Acesso ao Dashboard e Wallet continua livre pra ele recarregar/reativar.

### Sidebar

Adiciono **Marketplace**, **Carteira**, **Planos** (e **Admin** só pra role admin).

### Fases

**Fase A (agora):** schema, páginas Wallet + Marketplace + Planos + Admin do catálogo, provider `mock`, stub do Stripe (botões funcionando mas sem conectar pagamento real ainda), guard de assinatura.

**Fase B:** ativar Stripe payments (faço quando você confirmar) — produtos, checkout, webhook real.

**Fase C:** plugar provedor real (SMS-Activate ou 5sim) quando você escolher e me passar a credencial.

### Perguntas finais

1. **Markup padrão** sobre o custo do provedor — 50%? 100%? 200%? (Você edita por produto depois, é só o default do seed.)
2. **Pode ativar Stripe payments agora** (Fase B) ou só faço a estrutura visual primeiro?
3. **Custo do chip virtual descartável pro cliente** — sugiro R$ 7,90 a R$ 14,90 (custo provedor ~R$ 2-5). Concorda ou tem faixa de preço em mente?