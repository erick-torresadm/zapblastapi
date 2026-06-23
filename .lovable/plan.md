## O que vou entregar

Vou dividir em **2 PRs sequenciais** pra você poder testar cada coisa sem misturar bug com feature nova.

---

### PR 1 — Correção rápida do Maps (sai primeiro, ~15 min)

**Sintoma reportado:**
- "Não consigo salvar contatos no Pro" → o botão *Enviar para campanha* só fica ativo depois de uma busca e quando algum lead tem telefone; provavelmente você tentou clicar antes ou todos vieram sem telefone. Vou deixar o motivo do bloqueio visível (tooltip explicando).
- "Tá puxando muitos contatos" → a busca atual paginha 3x (até 60 leads) e o botão *Enviar para campanha* manda **todos** de uma vez. Vou trocar isso por:

**Mudanças:**
1. **Checkbox em cada lead** no resultado da busca (com "Selecionar todos" / "só com WhatsApp validado").
2. **Botão "Enviar para campanha" passa a usar só a seleção** — não mais o array inteiro.
3. **Slider "Quantidade máxima"** (10 / 20 / 40 / 60) antes de rodar a busca — controla o paginar do Places API. Default = 20.
4. **Mensagens de erro melhores** no `pushMapsLeadsToListFn` (diz quantos foram descartados por telefone inválido / duplicado).
5. **Tooltip no botão** quando bloqueado, dizendo o porquê ("nenhum lead com telefone", "selecione ao menos 1", etc.).

Não vou portar o snippet do WhatsApp Web (você confirmou que era só referência). A lógica dele é só DOM scraping da barra lateral — não dá pra rodar dentro do nosso app por causa de iframe/CORS do WhatsApp Web.

**Arquivos:** `src/components/tools/MapsExtractorCard.tsx`, `src/lib/maps.functions.ts` (parâmetro `max_results`), `src/lib/tool-credits.functions.ts` (mensagem de erro melhor).

---

### PR 2 — PWA instalável + Web Push admin

**A. PWA instalável (app inteiro)**
- `vite-plugin-pwa` com `generateSW`, `registerType: "autoUpdate"`, `NetworkFirst` pra HTML.
- Wrapper de registro com todas as guardas do Lovable (não registra em preview/iframe/dev, suporta `?sw=off`).
- `manifest.webmanifest` com nome **Perseidas**, theme color roxo, ícones 192/512 (gero com imagegen), `display: standalone`.
- Botão "Instalar app" no menu lateral quando `beforeinstallprompt` dispara.

**B. Web Push (VAPID)**
- Migration: tabela `push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, created_at)` com RLS por `auth.uid()`.
- Migration: tabela `admin_push_events(id, type, title, body, data jsonb, created_at)` para histórico.
- Secrets novos via `add_secret`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (te peço pra gerar — eu te dou o comando ou gero server-side via openssl).
- `VITE_VAPID_PUBLIC_KEY` no `.env` (chave pública é safe).
- Server fn `subscribePushFn` / `unsubscribePushFn` (qualquer user autenticado).
- Server fn `sendAdminPushFn` (admin-only via `has_role`) pra teste manual.
- Worker `public/push-sw.js` (separado do SW de cache) escutando `push` e `notificationclick` (abre `/app/admin/notifications`).
- Hook `usePushSubscription()` que pede permissão e registra.

**C. Eventos que disparam push pro admin**
Vou plugar em 4 pontos do código existente:
1. **Novo trial** (`signup_ip_log` insert OU `subscriptions` com `plan=trial` criado).
2. **Pagamento aprovado** (webhook Stripe/Paddle existente — onde a `subscriptions` vira `active` paga).
3. **Plano bloqueado/expirado** (cron que já roda, ou trigger no `subscriptions.status='past_due'/'canceled'`).
4. **Erros críticos** (catch global do server-side via `log_admin_action` com severity='critical').

Implementação: trigger SQL `AFTER INSERT/UPDATE` nessas tabelas chama uma **edge function** `notify-admins-push` que lê todos os admins de `user_roles WHERE role='admin'`, pega subscriptions deles e dispara `web-push`. (Edge function porque precisa do `web-push` npm com chave VAPID — ok aqui porque é caller externo: trigger Postgres → pg_net.)

**D. Tela `/app/admin/notifications`**
- Lista cronológica de `admin_push_events` (paginada, realtime).
- Filtros: tipo (trial/pago/bloqueado/erro), data.
- Botão "Enviar push de teste pra mim".
- Toggle "Receber push neste dispositivo" (chama `subscribePushFn`).

**iOS:** funciona, mas só depois que você instalar o PWA na tela inicial (limite do iOS 16.4+, não tem como contornar). Android/Chrome/Edge funciona direto.

---

## Ordem de execução

1. Aprovar este plano.
2. Eu mando o PR 1 (Maps fix) → você testa → confirma OK.
3. Eu peço os secrets VAPID e mando o PR 2 (PWA + Push).

Posso começar pelo PR 1 já?
