## Visão geral

Transformar o `/app/flows` de canvas em-memória em um **construtor + motor de fluxos** completo, integrado ao Evolution e à inbox, com métricas em tempo real e templates prontos.

Entregue em 5 etapas — cada uma já roda de ponta a ponta.

---

## Etapa 1 — Persistência e tela de listagem

### Banco (1 migração)

- `flows` — `name`, `description`, `status` (`draft` | `active` | `paused`), `trigger_type`, `trigger_config jsonb`, `instance_id` (qual chip envia), `current_version_id`
- `flow_versions` — `flow_id`, `version` (int), `nodes jsonb`, `edges jsonb`, `published_at`
- `flow_runs` — `flow_id`, `version_id`, `contact_id`, `instance_id`, `status` (`running`|`waiting`|`done`|`failed`|`stopped`), `current_node_id`, `wait_until`, `variables jsonb`, `started_at`, `finished_at`, `error`
- `flow_run_steps` — `run_id`, `node_id`, `node_type`, `status` (`ok`|`error`|`skipped`), `output jsonb`, `duration_ms`, `created_at`
- RLS por `user_id` em tudo, GRANT pra `authenticated` + `service_role`

### UI

- **`/app/flows`** (lista) — cards/tabela com nome, status, gatilho, taxa de conclusão (últimos 7d), botões **Editar · Duplicar · Pausar/Ativar · Excluir**
- **`/app/flows/$id`** (editor — refator do atual) — recebe `loader` com versão atual + topbar com **Salvar versão · Publicar · Testar**
- **Toggle Salvar**: cria nova `flow_version`, atualiza `current_version_id`. Auto-save de rascunho a cada 10s (debounce) num campo `draft_nodes/draft_edges` em `flows`

### Server fns

`listFlowsFn`, `getFlowFn`, `saveFlowDraftFn`, `publishFlowVersionFn`, `duplicateFlowFn`, `toggleFlowStatusFn`, `deleteFlowFn`

---

## Etapa 2 — Gatilhos reais

### Tipos suportados

1. **Palavra-chave** — quando msg recebida contém X (case-insensitive, lista de palavras)
2. **Mensagem nova de contato desconhecido** — primeira mensagem de número que nunca falou
3. **Contato novo na lista X** — quando entra contato na lista escolhida
4. **Manual / API** — disparo via botão "Testar" ou endpoint `/api/public/flows/$id/trigger`

### Onde liga

- Já existe `src/routes/api/public/evolution-webhook.$token.ts` → estender: ao receber `messages.upsert`, consultar `flows` ativos com `trigger_type='keyword'|'new_contact'` daquele `instance_id`, casar e enfileirar `flow_runs`
- Bloco de configuração de gatilho na topbar do editor (Sheet com seleção do tipo + config específica)
- Validação: fluxo não pode ser publicado sem trigger + sem `instance_id`

---

## Etapa 3 — Motor de execução + métricas por nó

### Arquitetura (sem Inngest, usando pg_cron já presente)

- **Enqueue**: webhook do Evolution ou trigger manual cria `flow_runs` com `status='running'` no nó inicial
- **Worker route** `src/routes/api/public/flow-worker.ts` — busca runs com `status='running'` OU `status='waiting' AND wait_until <= now()`, processa **1 nó por iteração** em lote (até 50), avança `current_node_id` seguindo as `edges`
- **Cron** `pg_cron` a cada 30s chama o worker (já temos `dispatch-worker` rodando assim)
- **Tipos de nó executáveis**:
  - `message` → `sendText` no Evolution (variáveis substituídas)
  - `media` → `sendMedia` (imagem/áudio/PDF do bucket `campaign-media`)
  - `buttons` → `sendButtons` (até 3 botões nativos WhatsApp)
  - `ask` → manda pergunta, marca run como `waiting`, contato deve responder; webhook casa msg de entrada com run em `waiting` e captura em `variables[chave]`
  - `delay` → `wait_until = now() + seconds`, status `waiting`
  - `condition` → avalia, segue handle `yes` ou `no`
  - `branch` (novo) → A/B aleatório por peso
  - `tag` → grava em `contacts.tags`
  - `ai` (novo) → chama **Lovable AI** (`google/gemini-2.5-flash` padrão) com prompt + contexto da conversa, salva resposta em `variables.ai_response` e/ou envia direto
  - `webhook` → POST pra URL externa, body com `{ contact, variables }`, opcionalmente captura resposta JSON em variáveis
  - `transfer_human` → marca conversa como `awaiting_human` na `inbox`, para o run

### Métricas por nó

- Cada execução grava 1 linha em `flow_run_steps`
- View materializada `flow_node_stats` (refresh a cada minuto): `flow_id, node_id, entered, completed, errored, avg_duration_ms`
- **Editor mostra os números em cima de cada nó** (badge "1.247 →" canto sup. direito, vermelho se erro >5%)

### Limites e segurança

- Respeita `daily_limit` e janela `08:00–20:00` do chip
- Circuit breaker: se >5 erros consecutivos no mesmo nó em 1min, pausa o fluxo e notifica
- `MAX_RUN_DURATION` 7 dias; runs órfãos são finalizados como `failed`

---

## Etapa 4 — Blocos novos + UX pro

### Novos blocos na palette

- **Mídia** (imagem/áudio/PDF, upload pro `campaign-media`)
- **Botões WhatsApp** (até 3 opções, cada uma vira saída separada do nó)
- **Pergunta** (envia + aguarda resposta, salva em variável nomeada, com timeout opcional)
- **IA** (prompt + modelo + saída em variável)
- **Split A/B** (peso configurável)
- **Transferir humano**

### UX

- **Undo/redo** via `zundo` no estado de nodes/edges (Ctrl+Z / Ctrl+Shift+Z)
- **Auto-layout** com `dagre` (botão "Organizar" — top-down)
- **Validação ao vivo** — painel inferior lista: nós sem conexão de saída (exceto folha), nós sem entrada (exceto start), ciclos, mensagens vazias, ramo da condição não conectado. Botão "Publicar" desabilita se houver erro
- **Atalhos**: Del/Backspace remove seleção, Ctrl+D duplica, Ctrl+S salva, espaço+drag para pan
- **Copiar/colar** nodes selecionados (Ctrl+C/V)
- **Mini-testador** (Sheet "Testar fluxo"): simula passo-a-passo no browser sem chamar Evolution, mostra mensagens renderizadas com variáveis preenchidas + permite escolher resposta nas perguntas
- **Versões** — dropdown na topbar lista últimas 10 versões com timestamp, permite "Restaurar"

---

## Etapa 5 — Templates prontos

Tela inicial do editor (quando fluxo está vazio) mostra modal **"Começar do zero" ou template**:

1. **Boas-vindas + qualificação** — saudação → pergunta nome → pergunta interesse → tag + transfere
2. **Recuperação de carrinho** — delay 1h → msg leve → delay 24h → desconto → delay 3d → última tentativa
3. **Suporte com IA** — recebe pergunta → IA responde com base no prompt do produto → se "falar com humano" → transfere
4. **Pesquisa NPS** — agradecimento → pergunta nota 0-10 → condição (≤6 detrator / 7-8 / ≥9) → resposta adequada → tag

Templates são objetos `{ nodes, edges, trigger_default }` em `src/lib/flow-templates.ts`.

---

## Stack adicional

- `bun add zundo dagre @types/dagre` (undo/redo + auto-layout)
- Sem novas conexões externas — usa Lovable AI Gateway já presente (`LOVABLE_API_KEY`)

## Fora de escopo (próximas fases)

- Colaboração multi-usuário (cursor compartilhado)
- Agendamento por horário comercial granular por dia
- Importar fluxos de outras plataformas
- Versionamento por branch / staging

## Ordem de entrega sugerida

E1 → E2 → E3 → E4 → E5. Cada etapa fecha um ciclo utilizável (E1 sozinha já salva e organiza; E2 já dispara mensagem única; E3 já roda multi-passos).