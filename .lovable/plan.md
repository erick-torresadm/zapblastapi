## Reforma total do CRM — WhatsApp Web vibes

O CRM hoje tem o esqueleto certo (lista + chat + painel + notas + QRs) mas a "alma" de WhatsApp Web não está lá: faltam wallpaper, agrupamento de balões, separadores de data, reply/reação, hover-actions, drag-and-drop, scroll infinito, fixar/arquivar, marcar como lida ao abrir, e identidade visual de aplicativo de mensagem. Esta é a reforma.

### Diretriz de design
- Layout 3-painéis fixo: **lista (360px) · chat (flex) · painel lateral colapsável (320px)**.
- Header e composer em "barras" — borda só embaixo, sem cards arredondados em volta do CRM inteiro.
- Cor de saída usa `primary` (Perseidas), entrada usa `card` neutro — segue branding mas com o ritmo de WW.
- Fundo do chat com **wallpaper sutil** (SVG pattern via tokens, respeita dark/light).
- Tipografia mais densa, hierarquia tipo WW (nome bold, prévia muted, hora 11px).

### 1. Lista de conversas (esquerda)
- **Filtros-chip no topo**: Todas · Não lidas · Favoritas · Grupos · Atribuídas a mim · Fila. Substitui Tabs + Select atuais.
- **Pesquisa** sempre visível, com botão "Nova conversa" (abre dialog: cola número → cria conversa).
- **Fixar conversa** (📌): pinned ficam no topo, separadas por divisor "Fixadas".
- **Arquivar**: dropdown na linha; arquivadas somem do default e aparecem em "Arquivadas" no rodapé da lista.
- **Item da conversa**: avatar 48px, nome + hora à direita, prévia com ícone de tipo (📷 🎤 📎), badge unread verde-primary, ícones discretos para fixado/silenciado, tag de status reduzida.
- **Selecionada**: faixa lateral primary à esquerda + bg muted.
- **Marcar como lida** ao abrir (zera `unread_count` via server fn).
- **Scroll infinito** na lista (paginação 50/50).

### 2. Cabeçalho do chat
- Avatar clicável (abre painel), nome, **status dinâmico**: "online" · "digitando…" · "gravando áudio…" · "visto por último HH:MM".
- Ações à direita: 🔍 buscar · 📞 ligar (placeholder grayed) · 📌 fixar · 🗄 arquivar · ⋮ menu (status, atribuir, exportar, deletar).
- Pill de status + atribuição.

### 3. Área de mensagens
- **Wallpaper SVG** sutil (doodles em opacity 6%) — token `--chat-wallpaper`.
- **Separadores de data** sticky: "Hoje" / "Ontem" / "12 de junho de 2026". Chip arredondado, sombra leve.
- **Agrupamento por autor + janela de 2 min**: balões consecutivos sem cauda nas intermediárias, hora só no último; avatar de agente uma vez por grupo.
- **Cauda** SVG no primeiro balão de cada grupo (estilo WW).
- **Hover actions** em cada balão (desktop): responder, reagir, encaminhar, copiar, deletar (para mim).
- **Quote / Reply**: clicar em "responder" insere preview acima do composer; renderiza acima do balão respondido em mensagens enviadas com `reply_to_id` (coluna nova).
- **Reações**: picker 6 emojis (👍 ❤️ 😂 😮 😢 🙏); render abaixo do balão; tabela/coluna `reactions jsonb` na `chat_messages`.
- **Encaminhar**: dialog seleciona conversas alvo e dispara `sendChatMessage` em cada.
- **Estrelar/Salvar mensagens**: coluna `starred bool`; filtro "Estreladas" no painel.
- **Status read receipts**: ✓ enviado · ✓✓ entregue cinza · ✓✓ azul lido (já tem dado, falta cor).
- **Scroll infinito** pra cima (carrega mensagens mais antigas em lotes de 50) + botão flutuante "↓ novas mensagens" quando chega msg fora da viewport.
- **Lightbox** vira viewer com swipe entre mídias da conversa.

### 4. Composer (estilo WW)
- Layout: 😀 emoji · 📎 anexar · textarea autosize · 🎤 audio · ➤ enviar. Picker de chip volta pro menu ⋮ (poluição menor).
- **Drag-and-drop arquivo** em qualquer lugar do chat → abre preview com caption antes de enviar.
- **Paste de imagem** do clipboard → mesmo preview.
- **Preview de mídia antes de enviar** (modal com legenda).
- **Reply preview** acima do composer com X pra cancelar.
- **/atalho** já existe — manter, melhorar autocomplete inline.
- **Emoji picker** decente: scrollable por categorias (emoji-mart-style minimal, hand-rolled p/ não trazer libs pesadas).

### 5. Painel do contato (direita)
- Manter campos atuais. Adicionar **abas**: "Perfil" · "Mídia" (grid de imagens/vídeos enviados) · "Documentos" · "Estreladas" · "Notas" (move notas pra cá, deixa de ser drawer extra).

### 6. Visual / tokens
- Novos tokens em `src/styles.css`:
  - `--chat-bg` (wallpaper base)
  - `--chat-out` / `--chat-out-fg` (bolha de saída)
  - `--chat-in` / `--chat-in-fg`
  - `--chat-tick-read` (azul WW)
- Wallpaper SVG inline em `src/components/crm/ChatWallpaper.tsx`.

### 7. Atalhos de teclado
- `Esc` fecha conversa
- `Ctrl+F` busca na conversa
- `↑/↓` navega lista
- `Ctrl+Enter` envia
- `/` abre quick replies

---

## Detalhes técnicos

**Schema**:
- Migration: `ALTER TABLE chat_messages ADD COLUMN reply_to_id uuid REFERENCES chat_messages(id), ADD COLUMN reactions jsonb DEFAULT '{}'::jsonb, ADD COLUMN starred boolean DEFAULT false, ADD COLUMN deleted_at timestamptz;`
- Migration: `ALTER TABLE crm_conversations ADD COLUMN pinned_at timestamptz, ADD COLUMN archived_at timestamptz, ADD COLUMN last_seen_at timestamptz, ADD COLUMN muted_until timestamptz;`
- Index: `(owner_user_id, pinned_at DESC NULLS LAST, last_message_at DESC)` e `(owner_user_id, archived_at) WHERE archived_at IS NOT NULL`.

**Server fns novas em `src/lib/crm.functions.ts`**:
- `markConversationReadFn(conversation_id)` — zera `unread_count` + atualiza `last_seen_at`.
- `togglePinConversationFn`, `toggleArchiveConversationFn`, `toggleMuteConversationFn`.
- `loadOlderMessagesFn(conversation_id, before_iso, limit=50)`.
- `reactToMessageFn(message_id, emoji)` — toggle.
- `starMessageFn(message_id, starred)`.
- `deleteMessageFn(message_id)` (soft delete `deleted_at`).
- `forwardMessagesFn(message_ids[], target_conversation_ids[])`.
- `startConversationFn(workspace, phone, instance_id)`.

**Componentes novos** (`src/components/crm/`):
- `ChatWallpaper.tsx` — SVG pattern.
- `DateSeparator.tsx`, `MessageGroup.tsx` (envolve N `MessageBubble` agrupados).
- `MessageActions.tsx` — toolbar hover (reply/react/forward/copy/star/delete).
- `ReactionPicker.tsx`, `ReactionBar.tsx`.
- `ReplyPreview.tsx`, `QuotedMessage.tsx`.
- `MediaPreviewDialog.tsx` — preview antes de enviar, com caption.
- `ForwardDialog.tsx`.
- `EmojiPicker.tsx` (categorias + busca, sem dependência externa).
- `ConvFilterChips.tsx`, `NewChatDialog.tsx`.
- `ContactTabs.tsx` (Perfil / Mídia / Docs / Estreladas / Notas).

**Refactor**:
- `app.inbox.tsx` (798 → ~300 linhas) — extrai sub-componentes `ConversationList`, `ChatHeader`, `ChatTranscript`, `Composer`, `ContactSidebar`.
- `MessageBubble.tsx` ganha props `onReply`, `onReact`, `onForward`, `onStar`, `onDelete`, `quoted`, `reactions`.

**Realtime**:
- Já assina `chat_messages` + `crm_conversations`. Adicionar dedup de toast/som e auto-scroll só se usuário já estava no fim.

**Acessibilidade**:
- Todos os botões com `aria-label`. Lista navegável com setas. Foco visível.

### Fora do escopo desta entrega
- Chamadas de voz/vídeo de verdade (só placeholder cinza).
- Mensagens efêmeras / "view once".
- Status / Stories.
- Grupos: criação de grupos (recebimento de mensagem de grupo já é suportado, só melhora-se a renderização do header).

### Risco / mitigação
- `chat_messages` é tabela quente; migrations só adicionam colunas nullable + índices, sem reescrita. Reactions/replies são opt-in — UI antiga continua válida.
- Realtime: dedup no client evita loop de invalidação.

### Estimativa de turnos
1. Migration + server fns novas + tipos.
2. Refactor de `app.inbox.tsx` em sub-componentes + lista nova + wallpaper + agrupamento + separadores.
3. Reply/Reagir/Encaminhar/Estrelar + hover actions.
4. Drag-drop, paste, preview de mídia, abas do contato, atalhos.
