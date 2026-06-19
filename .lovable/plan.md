
# Cartão recorrente mensal via Efí

Vou usar a API de **Planos + Assinaturas** da Efí, que já cobra automaticamente todo mês no cartão do cliente. Tudo na mesma conta Efí que já configuramos pro Pix.

## O que será feito

### 1. Banco de dados (migration)
- Adicionar em `subscription_plans`:
  - `efi_plan_id_sandbox` (int)
  - `efi_plan_id_prod` (int)
- Adicionar em `subscriptions`:
  - `efi_subscription_id` (int) — ID da assinatura na Efí
  - `payment_method` (text) — 'card' | 'pix' | 'trial'
  - `card_last4` (text)
  - `card_brand` (text)
  - `next_charge_at` (timestamptz)

### 2. Edge Functions novas
- **`efi-create-plan`** (admin) — cria o "Plano" na Efí (intervalo mensal, repetições infinitas) e salva o `plan_id` no `subscription_plans`. Roda 1x por plano.
- **`efi-subscribe-card`** — recebe `plan_id` + `payment_token` (tokenizado no frontend) + dados do cliente, cria a assinatura na Efí com `POST /v1/plan/:id/subscription/one-step`, atualiza `subscriptions` do usuário.
- **`efi-cancel-subscription`** — cancela na Efí + marca `status='canceled'` localmente.
- **`efi-webhook`** (estender o que já existe pro Pix) — tratar eventos de assinatura: `paid`, `unpaid`, `canceled`, `refunded`. Atualiza `status` da subscription e credita/debita conforme.

### 3. Frontend
- Componente `CardCheckout.tsx`:
  - Carrega o **Efí Payee Script** (`https://api.efipay.com.br/v1/cdn/<payee_code>/<timestamp>`) que tokeniza o cartão no browser (PCI-safe — o número do cartão nunca passa pelo nosso backend).
  - Formulário: número, validade, CVV, nome, CPF, email, telefone.
  - Ao submeter: gera `payment_token` → envia pra edge function `efi-subscribe-card`.
- Na página de planos (`/planos` ou onde está hoje): botão "Assinar com Cartão" ao lado do "Pagar com Pix".
- Página `/minha-assinatura`: mostrar cartão (•••• 4242), próximo débito, botão cancelar.

### 4. Secrets necessários
Já temos tudo: `EFI_CLIENT_ID_PROD/SANDBOX`, `EFI_CLIENT_SECRET_PROD/SANDBOX`, `EFI_CERT_PROD_BASE64`, `EFI_CERT_SANDBOX_BASE64`.
Precisaremos pegar o **Payee Code (Identificador de Conta)** no painel da Efí pra usar no script de tokenização do frontend — vou pedir quando chegar nessa etapa.

## Detalhes técnicos

**Fluxo de assinatura (one-step):**
```text
Frontend                          Backend (Edge)              Efí API
  │  tokeniza cartão (JS Efí)        │                           │
  │ ──────── payment_token ────────► │                           │
  │                                  │ ── POST /plan/:id/        │
  │                                  │    subscription/one-step ►│
  │                                  │ ◄──── subscription_id ────│
  │ ◄──── { status, sub_id } ─────── │ ── UPDATE subscriptions   │
```

**Webhook de assinatura:** Efí chama nossa URL com `notification` token → fazemos GET nesse token pra buscar os eventos (`charge.status = paid|unpaid|canceled`) → atualizamos a `subscription` correspondente via `efi_subscription_id`.

**Trial vs cartão:** o usuário no trial de 7 dias pode "Adicionar cartão" antes do fim do trial → assinatura na Efí com `payment_method=card`. Quando trial expirar, primeira cobrança roda automaticamente.

## Ordem de implementação
1. Migration (DB)
2. Edge function `efi-create-plan` + rodar uma vez pra criar o plano "Pro" na Efí
3. Edge function `efi-subscribe-card`
4. Componente `CardCheckout` + integrar na página de planos
5. Estender webhook pra eventos de subscription
6. Edge function `efi-cancel-subscription` + UI em `/minha-assinatura`

Posso começar? Vou seguir essa ordem e te avisar quando precisar do **Payee Code** (etapa 4).
