## Diagnóstico (já confirmado no banco)

Os gatilhos ESTÃO sendo identificados:
- Trigger `teste1` (instance `chip02`) bateu 3x hoje (`last_triggered_at = 23:36`).
- 3 `flow_runs` foram criados — mas todos terminaram com `status=failed`, `error="Número sem WhatsApp"`.

Causa raiz:
1. O nó `message` do fluxo chama `checkWhatsappNumbers()` (Evolution `/chat/whatsappNumbers`) com `validate_numbers=true`. O número que chegou no webhook (`274333033341090`, 15 dígitos) é, na prática, um LID/JID alternativo que a Evolution não reconhece como número válido — então `exists=false` e o run é marcado como `failed` antes de enviar a primeira mensagem.
2. O log de passos (`flow_run_steps`) está vazio para esses runs — o motor falhou tão cedo que não há rastro visível para o usuário no painel.
3. Não há fila visível no painel mostrando "fluxo disparado por gatilho" — o usuário só vê o card de Bot, sem feedback de execução.
4. Mensagens chegando como `@lid` ou outros domínios estão sendo descartadas silenciosamente no webhook (`return { skipped: chatType }`), sem log — o que mascara o caso em que "outro número meu" não é `@s.whatsapp.net`.

## O que vou fazer

### 1. Webhook — tornar a entrada do trigger robusta (`src/routes/api/public/evolution-webhook.$token.ts`)
- Quando o JID for `@lid`, extrair o número real do campo `key.senderPn` ou `data.pushName` quando presente, e tratar como `user` para fins de trigger (mantendo o CRM separado se quisermos).
- Adicionar logs estruturados (`console.log("[webhook]", ...)`) em cada etapa: evento recebido, instância resolvida, chat_type, fromMe, texto recebido — visíveis em `server-function-logs`.
- Não bloquear `triggerKeywordFlows` para tipos não-user quando vier `senderPn` válido.

### 2. Motor de fluxo — não falhar o run inteiro por validação (`src/lib/flow-engine.server.ts`)
- Mudar o comportamento de `validate_numbers`: se a checagem retornar `exists=false`, **registrar um aviso** (`flow_run_steps` com status `skipped` + nota) e **prosseguir** com o envio mesmo assim (a Evolution vai rejeitar com 400 se for inválido de fato; isso já é tratado). Hoje o run morre sem nem tentar enviar.
- Adicionar logs em `triggerKeywordFlows`: quantos triggers ativos, quais bateram, qual instância foi escolhida, ID do run criado.
- Garantir que `flow_run_steps` recebe um step "triggered" assim que o run é criado pelo gatilho (para a fila do painel).

### 3. Painel — nova aba "Disparos" na página Bot (`src/routes/_authenticated/app.keywords.tsx` + nova server fn)
- Acima da lista de gatilhos, mostrar uma **fila em tempo real** (auto-refresh a cada 5s) com os últimos 20 disparos:
  - Quando (`started_at`), palavra-chave que bateu, contato, fluxo, chip, status (`pending` / `waiting` / `running` / `completed` / `failed` + mensagem de erro).
- Server function `listRecentFlowRunsFn` lê `flow_runs` (+ `flow_run_steps` para erro) do user, ordenado por `started_at desc`, limit 50.
- Badge com contador "X disparos hoje".

### 4. Endpoint de teste manual de gatilho (`/api/public/flow-trigger-test` POST)
- Permite simular um webhook: recebe `{ keyword, phone }`, dispara `triggerKeywordFlows` como se fosse uma mensagem real. Botão "Testar" em cada linha da página Bot. Resultado aparece imediatamente na fila de disparos.
- Protegido pelo `apikey` (publishable key) já usado nos outros workers.

### 5. Verificar/criar agendamento do worker
- Confirmar que `pg_cron` está chamando `/api/public/flow-worker` a cada minuto (os runs estão sendo avançados, então provavelmente já existe; vou validar via `cron.job` com permissão admin). Se faltar, criar a schedule.

## Detalhes técnicos

```text
Caminho de uma mensagem com palavra-chave:
Evolution → webhook → log → triggerKeywordFlows
                              ├─ match (keywords + mode + cooldown + fromMe)
                              ├─ createFlowRun (status=pending, +step "triggered")
                              └─ pg_cron (/api/public/flow-worker, 1/min)
                                  └─ advanceFlowRun
                                      ├─ message → (validate? warn, segue) → sendText
                                      └─ next node...
```

Arquivos a editar:
- `src/routes/api/public/evolution-webhook.$token.ts` — logs + tratamento de `@lid`
- `src/lib/flow-engine.server.ts` — `validate_numbers` vira warning; logs; step "triggered"
- `src/routes/_authenticated/app.keywords.tsx` — UI da fila de disparos
- `src/lib/keywords.functions.ts` — nova `listRecentFlowRunsFn`
- `src/routes/api/public/flow-trigger-test.ts` — endpoint de teste (novo)
- Migration: opcional, só se faltar o pg_cron schedule.

Tudo é alteração de presentação + lógica server, sem mudar schema (exceto cron, se faltar).
