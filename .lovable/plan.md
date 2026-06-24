
## Objetivo

Hoje a aba "Conversas" decide em runtime se mostra Chatwoot, Twenty ou CRM interno (toggle `replace_inbox`). Vou separar tudo em **três entradas distintas no menu**, cada uma com sua página, e garantir que cada usuário tenha seu próprio workspace isolado (já existe na base, falta deixar explícito na UI + provisionamento automático).

## Nova estrutura do menu (sidebar)

Substituir o item único "Conversas" por um grupo:

```text
Atendimento
├── Conversas         (CRM interno do WhatsApp — atual)
├── CRM Vendas  [Beta]   (Twenty — pipeline/deals)
└── Inbox Pro   [Beta]   (Chatwoot — multi-agente/helpdesk)
```

Nomes neutros (sem citar "Chatwoot" ou "Twenty" na UI do usuário):
- **CRM Vendas** = Twenty (gestão de deals, contatos, pipeline)
- **Inbox Pro** = Chatwoot (helpdesk multi-agente)
- Badge `Beta` (pill amarela pequena) ao lado de cada um dos dois.

Cada item só aparece "ativo/clicável" depois de provisionado; antes disso leva para uma tela de onboarding ("Ative seu CRM Vendas / Inbox Pro").

## Páginas

### 1. `/app/crm-vendas` (nova)
- Se o usuário **não tem** `twenty_connections` ativa → tela de onboarding com botão "Ativar meu CRM Vendas" (provisionamento automático já existe em `twenty.functions.ts`).
- Se tem → iframe do workspace Twenty do usuário (URL/token já salvos por usuário), em tela cheia dentro do shell.
- Botão "Desconectar" e link "Abrir em nova aba" no canto.
- Aviso amarelo no topo: "Recurso em beta — seu workspace é privativo e isolado."

### 2. `/app/inbox-pro` (nova, renomeia `/app/settings/chatwoot` + iframe)
- Se o usuário **não tem** `chatwoot_connections` → onboarding com botão "Ativar meu Inbox Pro" (chama `provisionChatwootFn` existente).
- Se tem → iframe SSO do Chatwoot do usuário (já implementado em `getChatwootSsoUrlFn`).
- Toggles: "Sincronizar WhatsApp ↔ Inbox Pro" (já existe), "Notificações", "Desconectar".
- Mesmo aviso beta.

### 3. `/app/inbox` (existente)
- Volta a ser **só o CRM interno do WhatsApp** (remove a lógica de "replace_inbox" — agora cada ferramenta tem sua própria página).
- Mantém todo o comportamento atual de chat.

## Workspace por usuário (garantias)

Já está implementado no backend, só preciso reforçar:
- `twenty_connections.user_id` (PK lógica) + RLS `auth.uid() = user_id` ✅
- `chatwoot_connections.user_id` + RLS ✅ — cada usuário ganha 1 account + 1 user no Chatwoot via Platform API.
- Provisionamento automático no **primeiro clique** em cada página (sem precisar passar pelo "Carteira → ..."). Se já existir, reaproveita.
- Iframe sempre carrega com token/SSO do próprio usuário; nenhuma rota expõe token de outro.

## Mudanças concretas

**Frontend:**
1. `src/components/AppSidebar.tsx` — adicionar grupo "Atendimento" com 3 itens, badge `Beta` nos 2 novos. Remover toggle de replace_inbox da UI.
2. `src/routes/_authenticated/app.crm-vendas.tsx` (novo) — onboarding + iframe Twenty.
3. `src/routes/_authenticated/app.inbox-pro.tsx` (novo) — onboarding + iframe Chatwoot (com SSO).
4. `src/routes/_authenticated/app.inbox.tsx` — remover lógica `InboxOrCRM`/iframes; deixar só o CRM interno.
5. `src/routes/_authenticated/app.settings.twenty.tsx` e `app.settings.chatwoot.tsx` — manter como páginas de configurações avançadas (toggles de sync, webhook, desconectar), mas o **ponto de entrada principal** passa a ser via menu.
6. Componente `<BetaBadge />` reutilizável.

**Backend:** zero mudanças — toda a infra (provisionamento automático, SSO, sync bidirecional, RLS por user) já existe.

## Pergunta antes de gerar o plano final

Confirma os nomes neutros **"CRM Vendas"** (Twenty) e **"Inbox Pro"** (Chatwoot)? Se preferir outros (ex.: "Vendas" / "Atendimento", "Pipeline" / "Suporte"), me diz que ajusto antes de implementar.
