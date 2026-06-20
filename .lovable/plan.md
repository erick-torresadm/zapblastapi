## Plano de Hardening de Segurança — ZapBlast API

Pesquisei boas práticas para apps "vibecoding" (apps gerados rapidamente com Lovable/Supabase) e os vetores mais comuns são: brute force em login, endpoints públicos sem rate limit, RLS frouxa, segredos vazando para o cliente, ausência de logs de auditoria e admin sem MFA. Abaixo o plano dividido em camadas.

### 1. Proteção do Login (anti brute force)

- Ativar **HIBP (Have I Been Pwned)** no Supabase Auth para bloquear senhas vazadas.
- Forçar política de senha: mínimo 10 caracteres, exigir letras + números + símbolo.
- Implementar **rate limit no client** em `/auth` (cooldown progressivo: 3 tentativas → espera 30s, 5 → 5min, 10 → bloqueio 1h via tabela).
- Criar tabela `auth_attempts` (email + ip + tentativas + bloqueado_até) consultada por server fn antes de permitir nova tentativa.
- Captcha (hCaptcha já vem nativo no Supabase) — habilitar via `configure_auth`.
- Logar tentativas em `signup_ip_log` / nova `login_attempts_log` para auditoria.

### 2. Proteção do Admin

- Validar role `admin` **sempre via `has_role()` no servidor** (nunca client-side). Auditar todas as server fns que usam `supabaseAdmin` e exigir `requireSupabaseAuth` + check de role.
- Criar `_authenticated/_admin/route.tsx` (layout gate) que faz `beforeLoad` checando `has_role(uid, 'admin')` via server fn — sem isso, redireciona.
- Mover `app.admin.catalog.tsx` para esse gate.
- Adicionar **log de auditoria** (`admin_audit_log`): toda ação privilegiada (alterar plano, criar chip catalog, dar role) grava actor_id, ação, payload, ip.
- Recomendar (e mostrar banner) habilitar **MFA TOTP** para contas admin.

### 3. Endpoints Públicos (`/api/public/*`)

Hoje temos: `evolution-webhook`, `dispatch-worker`, `flow-worker`, `warmup-worker`, `flow-trigger-test`.

- **Webhook Evolution**: já usa token na URL — adicionar validação de timing-safe compare e log de IP. Garantir que `flow-trigger-test` exija o mesmo token ou auth.
- **Workers (dispatch/flow/warmup)**: exigir header secreto `X-Worker-Secret` (novo secret `WORKER_CRON_SECRET`) — hoje qualquer um pode disparar via URL pública.
- Rate limit básico in-memory por IP (token bucket) nesses endpoints para mitigar flood.
- Validar todo input com **Zod** antes de processar.

### 4. Exposição de Dados / RLS

- Rodar scan de segurança e revisar cada policy:
  - Tabelas user-scoped (`flows`, `campaigns`, `chat_messages` etc.) → policies devem usar `auth.uid()` e nunca ter SELECT para `anon`.
  - Tabelas `subscription_plans`, `chip_catalog` → revisar se exposição pública é intencional.
- Remover `GRANT` para `anon` onde não houver policy `TO anon`.
- Conferir que `service_role` não está sendo usado em código que roda no client.
- Garantir que respostas de server fns **não retornam PII desnecessária** (ex.: `email`, `ip`, `raw_payload` completo).

### 5. Headers de Segurança e CORS

- Adicionar middleware global em `src/start.ts` para injetar headers:
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` mínimo
  - CSP básica permitindo Supabase + Evolution
- CORS restrito nos endpoints públicos (apenas origem necessária; webhook permanece aberto mas autenticado).

### 6. Validação de Input

- Auditar server fns sem `inputValidator(zod)` e adicionar schemas com bounds (min/max length, regex telefone, etc.).
- Sanitizar texto de mensagens/flows antes de salvar (remover null bytes, limitar tamanho).

### 7. Segredos e Configuração

- Confirmar via `fetch_secrets` que nenhum secret server-only está exposto como `VITE_`.
- Rotacionar `LOVABLE_API_KEY` se houver suspeita.
- Documentar no `security memory` o modelo de acesso.

### 8. Monitoramento

- Tabela `security_events` (login_failed, admin_action, webhook_rejected, rate_limited) consultável por admin numa nova aba **Admin → Segurança**.
- Edge alerta (futuro) por e-mail quando >N eventos críticos/min.

---

### Ordem de Implementação Sugerida

1. Migration: `login_attempts`, `admin_audit_log`, `security_events` + RLS/GRANTs.
2. Server fn `check_login_rate_limit` + integração na `/auth`.
3. `configure_auth` (HIBP + senha forte + captcha).
4. Layout `_authenticated/_admin` + `has_role` check + mover admin pages.
5. Worker secret nos `/api/public/*-worker` + validação Zod.
6. Headers globais em `start.ts`.
7. Auditoria RLS + scan + correções.
8. Página Admin → Segurança (logs).
9. Atualizar `security memory`.

### Decisões que Preciso Confirmar

- **Captcha**: ativar hCaptcha no login (precisa de site key — managed pelo Supabase, ok)?
- **MFA admin**: só banner recomendando, ou bloquear admin sem MFA?
- **Worker secret**: posso gerar `WORKER_CRON_SECRET` automaticamente e você atualiza os jobs cron que chamam esses endpoints?
- Quer que eu implemente **tudo de uma vez** ou em fases (começando por login + admin)?
