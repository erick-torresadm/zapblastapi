# Ajuste de copy da home

Posicionar a plataforma como **suíte completa: Disparos + Fluxos/Bot + CRM**, não só "disparador anti-ban".

## Mudanças (só `src/routes/index.tsx`)

### 1. Meta tags (SEO/OG)
- **Title:** `Perseidas — Disparos, Chatbot e CRM no WhatsApp sem ban`
- **Description:** `Plataforma all-in-one: disparos em massa anti-ban, fluxos automáticos com palavra-chave, CRM com múltiplos atendentes e aquecimento de chips. Tudo num só painel.`
- OG title/description espelhando.

### 2. Hero
- **Badge:** `Disparos · Fluxos · CRM · Anti-ban`
- **H1:** `WhatsApp em escala, <span aurora>do disparo ao atendimento</span>`
- **Sub:** `Dispare campanhas anti-ban, automatize respostas com fluxos por palavra-chave e atenda no CRM com sua equipe — tudo no mesmo painel, com aquecimento automático dos chips.`
- CTA secundário muda de "Como evitamos bans" → "Ver recursos"

### 3. Métricas — trocar 1 card
- Substituir `Chips ativos` por `Fluxos rodando` (mais coerente com novo posicionamento) — manter os outros 3.

### 4. Seção Features (`#features`)
- **Eyebrow:** `Plataforma completa`
- **H2:** `Disparo, bot e atendimento. Um painel só.`
- Reorganizar o bento pra mostrar os 3 pilares + suporte. Card grande continua sendo Anti-ban Engine (é o diferencial técnico). Adicionar **4 cards novos** e remover 2 redundantes:
  - **NOVO** `Fluxos com palavra-chave` (Workflow) — "Cliente manda 'preço', bot dispara fluxo. Envia texto, imagem, áudio, vídeo, com digitando… simulado."
  - **NOVO** `CRM multi-atendente` (Inbox) — "Inbox estilo WhatsApp Web. Transfira conversas, atribua filas, veja só o que é seu."
  - **NOVO** `Bot 24/7` (Bot) — "Responde fora do horário, qualifica lead e entrega pronto pra venda."
  - **NOVO** `Equipe e permissões` (Users) — "Convide atendentes, controle quem vê o quê, dono fica com a fila."
  - Manter: Aquecimento bidirecional, Marketplace de chips, Spintax, Relatórios em tempo real.
  - Remover: Rotação inteligente e Agendamento (mover pra dentro de outros cards como bullets pra não inflar).

### 5. Seção Anti-ban — manter intacta (é diferencial técnico real).

### 6. CTA final
- **H2:** `Pronto pra rodar tudo num lugar só?`
- **Sub:** `Crie sua conta, conecte seu chip e tenha disparo, fluxo e CRM ativos em 5 minutos. 7 dias grátis no plano Pro.`

### 7. Footer tagline
- `© 2026 Perseidas · Disparos + Fluxos + CRM no WhatsApp`

## Fora de escopo
Sem mudanças de layout, design system, animações, ou nas seções de Pricing/FAQ. Só texto + 4 cards trocados no bento + 1 ícone novo na lista de imports.
