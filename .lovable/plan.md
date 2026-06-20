
# Módulo Tráfego & Funis

Novo módulo **isolado** (prefixo `traffic_*` no banco, rotas próprias). Nada do core (CRM, campanhas, agenda) é alterado. Se algo der errado aqui, o resto continua funcionando.

## 1. O que o usuário ganha

- **Builder de funil simples** (estilo inLead): blocos drag-and-drop — Headline, Texto, Imagem, Vídeo (YouTube/Vimeo), Botão WhatsApp, Botão Agenda, Formulário (nome+telefone+email), Depoimento, Countdown, FAQ.
- **Link-in-bio** (página única com botões), usando o mesmo motor de renderização do builder mas com um template pronto.
- **Domínio próprio do cliente via CNAME** (`funil.dominiodele.com`) — protege nosso domínio raiz dos Ads.
- **Tracking nativo por funil/página**: Facebook Pixel + CAPI server-side, GA4 e GTM. Eventos automáticos: `PageView`, `ViewContent`, `Lead` (form submit), `Contact` (clique WhatsApp), `Schedule` (clique agenda).
- **Leads capturados** caem direto em uma lista do CRM (lista escolhida na config do funil) — reaproveita tabela `contact_lists` existente, sem alterar nada.

## 2. Arquitetura — máxima simplicidade

```text
src/routes/
  _authenticated/
    app.traffic.tsx               → dashboard do módulo (lista funis, criar novo)
    app.traffic.$id.editor.tsx    → editor visual do funil
    app.traffic.$id.analytics.tsx → views, cliques, leads, eventos enviados
  f.$slug.tsx                     → render público (subdomínio nosso: funil.zapblastapi…)
  api/public/
    traffic-render.$slug.ts       → SSR do funil quando vem de domínio próprio (Host header)
    traffic-event.ts              → endpoint CAPI (recebe evento do client e reenvia server-side pro Facebook)
    traffic-lead.ts               → recebe submissão de formulário, grava lead + dispara Lead event
    traffic-domain-verify.$token.ts → verificação de domínio (TXT) e checagem CNAME
```

### Tabelas novas (todas prefixo `traffic_`)

- `traffic_funnels` — id, owner_user_id, slug, title, status (draft/published), template (funnel/linkbio), settings (jsonb: pixel_id, capi_token, ga4_id, gtm_id, default_list_id), custom_domain, custom_domain_status, created_at.
- `traffic_blocks` — id, funnel_id, position, type, props (jsonb). Cada bloco é renderizado por um componente React puro.
- `traffic_events` — id, funnel_id, event_name, anonymous_id, fbp, fbc, ip_hash, ua, payload (jsonb), created_at. Particionado por data ou com índice por funnel_id+created_at.
- `traffic_leads` — id, funnel_id, name, phone, email, utm (jsonb), pushed_to_list_id, created_at.
- `traffic_custom_domains` — id, funnel_id, host, verify_token, dns_ok, ssl_ok, last_checked_at.

Todas com RLS escopada por `owner_user_id` (segue padrão do projeto). Endpoints públicos usam SECURITY DEFINER ou service_role só pro que é estritamente necessário (renderização e inserts de event/lead).

## 3. Pixel + CAPI (server-side, sem mexer no core)

- Client dispara evento → POST em `/api/public/traffic-event` com `funnel_slug`, `event_name`, `event_id` (dedupe), `fbp`, `fbc`.
- Handler busca `pixel_id` + `capi_token` do funil e faz POST pro Graph API do Facebook (`https://graph.facebook.com/v20.0/{pixel_id}/events`). Hasheia IP/email/telefone com SHA-256.
- Mesmo `event_id` é usado no client (`fbq('track', ..., {eventID})`) e no server → Facebook deduplica.
- Erros logam em `traffic_events.payload.error` mas nunca quebram o render do funil.

GA4/GTM: injetados via `<script>` no SSR quando configurados. Sem CAPI server-side pro GA (overkill pra MVP).

## 4. Domínio próprio via CNAME (passo a passo pro cliente)

Fluxo no painel:
1. Cliente adiciona `funil.dominiodele.com` na config do funil.
2. Geramos um `verify_token`. Mostramos 2 registros DNS pra ele colar no registrador:
   - `CNAME funil → cname.zapblastapi.lovable.app` (ou subdomínio dedicado nosso)
   - `TXT _zapblast-verify.funil → <verify_token>`
3. Botão **Verificar agora** chama `/api/public/traffic-domain-verify/$token` que faz resolução DNS e marca `dns_ok=true`.
4. Para SSL automático, usamos **Cloudflare for SaaS** (Custom Hostnames API) — única dependência externa nova. Alternativa mais barata: orientar cliente a colocar Cloudflare grátis dele na frente e proxiar pra nós (perde menos infra nossa). **Recomendação MVP**: começar com instrução "use Cloudflare grátis do seu lado, modo proxy"; adicionar Cloudflare for SaaS depois se virar gargalo.
5. Quando uma request chega no nosso edge com `Host: funil.dominiodele.com`, o middleware mapeia host → `funnel_id` e renderiza.

> Importante: nada disso usa nosso domínio raiz como destino dos Ads. Se o cliente queimar o domínio dele, problema dele.

## 5. Editor (mínimo viável)

- Lista de blocos à esquerda, preview ao centro, painel de propriedades à direita.
- Drag-and-drop com `@dnd-kit/sortable` (já popular, sem dependências pesadas).
- Salva no banco a cada mudança com debounce de 800ms.
- **Sem versionamento, sem A/B test, sem templates de mercado no MVP** — apenas 2 templates iniciais (funil de captura, link-in-bio).
- Tema: input de cor primária + fonte (4 opções). Nada mais customizável no MVP.

## 6. O que NÃO entra agora (pra ficar simples)

- Pagamentos/checkout no funil
- A/B test
- E-mail automation
- Templates de marketplace
- Cloudflare for SaaS automatizado (cliente usa Cloudflare dele no MVP)
- Editor mobile-first separado (responsivo automático básico já basta)

## 7. Detalhes técnicos

- **Renderização pública** é SSR puro via TanStack server route. Sem auth, sem RLS-as-user — usa `supabaseAdmin` apenas pra SELECT no funil pelo slug/host (projeta só colunas seguras).
- **Resolução de host customizado**: middleware lê `request.headers.get('host')`, consulta `traffic_custom_domains` (cache em memória do worker por 60s), resolve `funnel_id`.
- **CAPI**: token do Facebook fica em `traffic_funnels.settings` (criptografado com pgsodium se possível, ou no mínimo só acessível via RPC). Considerar mover pra `vault` se sensível.
- **Eventos**: tabela `traffic_events` pode crescer muito; criar índice `(funnel_id, created_at DESC)` e job mensal de archive (futuro).
- **Sidebar**: nova entrada "Tráfego & Funis" abaixo de "Agenda".
- **Memória do projeto**: criar `mem://features/traffic.md` documentando tabelas, fluxo CAPI, fluxo de domínio custom.

## 8. Ordem de implementação

1. Migração: tabelas `traffic_*` + RLS + GRANTs.
2. Editor + render público no subdomínio nosso (`/f/$slug`) + 2 templates.
3. Pixel client-side + GA4/GTM.
4. CAPI server-side (`/api/public/traffic-event`).
5. Captura de leads → `contact_lists`.
6. Domínio customizado via CNAME + verificação DNS (cliente coloca Cloudflare na frente).
7. Tela de analytics simples (totais + últimos eventos + leads).

Pronto pra implementar? Quando aprovar eu começo pela migração e pelo motor de renderização.
