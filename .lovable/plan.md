# Plano: Análise anti-ban + Redesign UI/UX completo

## Parte 1 — Análise técnica (entregue como página `/app/anti-ban` + doc interno)

### whatsapp-web.js (pedroslopez)
- **Como funciona**: roda Chromium headless via Puppeteer e automatiza a interface do WhatsApp Web. Cada instância = 1 navegador.
- **Por que banna mais**:
  - WhatsApp identifica cliente como "WhatsApp Web" — fingerprint de Chromium automatizado é detectável (navigator.webdriver, ausência de plugins reais, timing perfeito).
  - Sem suporte nativo a presença/digitação em tempo real do protocolo — simula via DOM, o que gera padrões.
  - Recursos pesados: cada sessão consome ~300MB RAM, o que limita escala e força reuso agressivo de instâncias.
  - Bibliotecas desatualizadas frente a mudanças do WA Web quebram fluxo e disparam reconexões suspeitas.

### Evolution API (Baileys por baixo)
- **Como funciona**: implementa o protocolo multi-device direto via WebSocket. Conecta como se fosse um celular pareado real (mesmo handshake do app oficial).
- **Por que banna menos** (não "não banna"):
  - Tráfego é idêntico ao de um device legítimo — sem fingerprint de browser.
  - Suporte nativo a `presence` (online/typing/recording), read receipts, status — comportamento humano sai "de graça".
  - Reconexão silenciosa, sem reload de página.
  - Leve (~30MB por instância), permite ter muitas sessões pequenas em vez de uma sessão sobrecarregada.

### O que realmente derruba número (independente da lib)
1. **Volume sem warmup** — chip novo disparando 200+ msgs/dia = ban em horas.
2. **Conteúdo idêntico** — mesma mensagem byte-a-byte pra N contatos.
3. **Sem variação de timing** — intervalos fixos (ex: 5s exatos).
4. **Disparo a não-contatos** — quem nunca te salvou e recebe link = denúncia fácil.
5. **Links/mídia já na 1ª msg** — gatilho clássico.
6. **Zero inbound** — número que só fala e nunca responde é flagado.
7. **Denúncias (botão "Bloquear e Denunciar")** — 3-5 denúncias = ban.
8. **Reconexões frequentes / múltiplos IPs** — sessão instável.

### Boas práticas que vamos aplicar (já temos warmup, falta refinar)
- Warmup escalonado: dia 1-3 = 20 msg/dia, dia 4-7 = 50, dia 8-14 = 150, depois 300+.
- Spintax obrigatório (`{Oi|Olá|E aí}, {tudo bem|como vai}?`).
- Delays randômicos 8-45s entre msgs + janela de horário comercial.
- `presence: composing` 2-5s antes de enviar.
- Limite diário por instância configurável + circuit-breaker se taxa de erro >5%.
- Aquecimento bidirecional (números conectados conversando entre si — já existe).
- Avisar usuário: primeiro contato sem link, pedir pra salvarem antes de campanhas com mídia.

**Entrega**: página `/app/anti-ban` com esse conteúdo formatado + tooltips/badges nas telas de campanha alertando quando o usuário está pisando em alguma dessas regras.

---

## Parte 2 — Redesign UI/UX (Midnight Indigo · Sora/Manrope · Sidebar)

### Design system (src/styles.css)
- Paleta semântica:
  - `--background: #0a0a1a` (deep space)
  - `--card: #141432`
  - `--border: oklch(...)` ~ #1e1e5a com 40% opacity
  - `--primary: #4f46e5` + `--primary-glow: #6366f1`
  - Gradientes: `--gradient-hero`, `--gradient-card`, `--gradient-primary`
  - Shadows: `--shadow-glow` (indigo bloom), `--shadow-elegant`
- Fontes: Sora (display, h1-h3) + Manrope (body, ui). Carregadas via `<link>` em `__root.tsx`.
- Componentes shadcn re-skinados via variantes (button `premium`/`glow`, card com border-beam opcional).
- Densidade: padding generoso, radius 12-16px, micro-animations (fade/slide 200-300ms).
- MagicUI seletivo: `BorderBeam` em CTAs, `AnimatedGridPattern` no fundo do dashboard, `NumberTicker` em métricas, `Meteors` na landing.

### Shell (toca toda navegação autenticada)
- **AppSidebar**: rebuild com seções colapsáveis (Operação / Conta / Admin), ícones lucide consistentes, item ativo com indicador lateral animado em `--primary`, avatar+plano no rodapé, status de conexão (bolinha verde "X instâncias online").
- **Topbar nova**: breadcrumb dinâmico, busca global (⌘K), saldo da carteira inline, badge de assinatura, avatar dropdown.
- **Mobile**: sidebar vira sheet, topbar compacta.

### Telas (todas as 14)

| Tela | Tratamento |
|---|---|
| `/` (landing) | Hero com aurora text "Dispare sem ser banido", meteors, 3 features bento (Anti-ban / Warmup / Marketplace), pricing, FAQ, footer. |
| `/auth` | Split-screen: form à esquerda, painel decorativo com particles à direita. Google + email. |
| `/app` (dashboard) | Bento grid: KPIs (msgs hoje, taxa entrega, instâncias online, saldo) com NumberTicker; gráfico de envios 7d (recharts area); lista de campanhas ativas; alertas anti-ban. |
| `/app/instances` | Grid de cards de instância com QR inline em dialog, status pulsante, ações (restart/desconectar), badge de "health score" baseado em métricas anti-ban. |
| `/app/servers` | Tabela densa + form lateral, teste de conexão com feedback visual. |
| `/app/campaigns` | Lista com filtros, cards de status (rascunho/agendada/rodando/concluída), barra de progresso. |
| `/app/campaigns/new` | Wizard 4 passos (Lista → Mensagem com spintax preview → Anti-ban settings → Revisão), validador anti-ban em tempo real ("⚠ sem spintax, risco alto"). |
| `/app/campaigns/$id` | Header com KPIs, timeline de envios, logs filtráveis, botão pausar/retomar. |
| `/app/lists` + `/app/lists/$id` | Upload CSV drag-drop, preview, dedup, validação de número BR. |
| `/app/inbox` | Layout 3 colunas (conversas / chat / detalhes contato) estilo Intercom. |
| `/app/warmup` | Dashboard de aquecimento: grafo de conexões entre números, gráfico de progressão diária, controles de intensidade. |
| `/app/marketplace` | Cards de chip com badge "BR · Virtual", filtros, modal de compra mostrando saldo. |
| `/app/wallet` | Card grande de saldo com gradient, botões de recarga (R$50/100/250/custom), tabela de transações. |
| `/app/billing` | 3 cards de planos (Starter/Pro/Scale) com hover-lift e BorderBeam no recomendado. |
| `/app/admin/catalog` | Tabela admin com inline-edit, badge de margem, drawer pra criar produto. |
| `/app/anti-ban` (nova) | Doc visual da parte 1 com seções colapsáveis e checklist interativo. |

### Implementação em fases
1. **F1 — Design system + shell** (styles.css, Sidebar, Topbar, fontes, MagicUI base) — base pra tudo.
2. **F2 — Landing + Auth** (vendem o produto).
3. **F3 — Dashboard + Instances + Anti-ban page** (core).
4. **F4 — Campaigns (lista/new/detalhe) + Lists** (fluxo principal).
5. **F5 — Inbox + Warmup + Marketplace + Wallet + Billing** (suporte).
6. **F6 — Admin + polish (loading states, empty states, toasts, mobile QA)**.

### Detalhes técnicos
- Sem mudança de schema/backend — puro frontend/presentation.
- `@theme inline` pro shadcn continuar funcionando com os novos tokens.
- MagicUI: copiar componentes individuais pra `src/components/magicui/` (não tem pacote npm próprio).
- Garantir contraste AA em todos os pares (Manrope #cbd5e1 sobre #0a0a1a, etc).
- Reduce-motion respeitado em todas as animações.

### Fora do escopo
- Lógica de negócio (warmup engine, provedores, Stripe) — fica como está.
- Migrations.
- Mudanças na Evolution API integration.

Posso começar pela Fase 1 (design system + shell) assim que aprovar.
