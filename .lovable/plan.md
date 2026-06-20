
# Módulo Agenda (Booking + Confirmações + Reengajamento)

Novo módulo dentro do ZapBlast. Cada workspace (tenant = `owner_user_id`) pode publicar uma página pública de agendamento, gerenciar serviços e profissionais, e disparar confirmações/reengajamento via WhatsApp usando as instâncias já existentes.

## 1. Banco de dados (1 migration)

Tabelas em `public` (todas com RLS por `owner_user_id`, GRANT pra `authenticated` + `service_role`; `agenda_businesses`, `agenda_services`, `agenda_professionals`, `agenda_availability`, `agenda_appointments` ganham GRANT SELECT pra `anon` somente nas colunas seguras via policies específicas):

- **agenda_businesses** — `owner_user_id`, `slug` (único, usado em `/agenda/{slug}`), `name`, `timezone` (default `America/Sao_Paulo`), `default_instance_id` (FK `whatsapp_instances`), `confirm_offsets_minutes int[]` (ex: `{1440,120}`), `active`.
- **agenda_professionals** — `business_id`, `name`, `phone` (recebe confirmação dele mesmo), `color`, `active`.
- **agenda_services** — `business_id`, `name`, `duration_min`, `price_cents`, `description`, `active`.
- **agenda_service_professionals** — N×N serviço↔profissional.
- **agenda_availability** — `professional_id`, `weekday` (0–6), `start_time`, `end_time`, `slot_step_min` (default = duração do serviço).
- **agenda_blocks** — `professional_id`, `starts_at`, `ends_at`, `reason` (férias, almoço pontual, bloqueio manual).
- **agenda_appointments** — `business_id`, `professional_id`, `service_id`, `customer_name`, `customer_phone`, `customer_notes`, `starts_at`, `ends_at`, `status` (`pending`|`confirmed_customer`|`confirmed_pro`|`cancelled`|`no_show`|`done`), `confirm_token` (uuid, usado no link público de confirmar/cancelar), `created_via` (`public`|`manual`).
- **agenda_notifications** — log: `appointment_id`, `kind` (`booking_created`|`reminder`|`reengagement`), `target` (`customer`|`professional`), `phone`, `instance_id`, `scheduled_at`, `sent_at`, `status` (`queued`|`sent`|`failed`|`replied_yes`|`replied_no`), `wa_message_id`, `error`.
- **agenda_reengagement_campaigns** — `business_id`, `name`, `message_template` (com `{nome}`, `{cupom}`, `{link}`), `coupon_code` (opcional, reaproveita tabela `coupons`), `target_filter` (jsonb: `{ inactive_days: 30, service_ids: [], ... }`), `cron` (`every_30_days`|`every_15_days`|`weekly`), `active`, `last_run_at`.

RPCs SECURITY DEFINER:
- `agenda_public_get_business(_slug text)` → dados públicos (nome, serviços, profissionais ativos).
- `agenda_public_get_slots(_business_id, _service_id, _professional_id, _date)` → calcula slots livres a partir de availability − blocks − appointments existentes.
- `agenda_public_book(...)` → cria appointment (status `pending`), valida conflito por `EXCLUDE USING gist` ou re-check no commit, enfileira `booking_created` + `reminder` rows em `agenda_notifications` baseado em `confirm_offsets_minutes`.
- `agenda_confirm(_token, _by)` / `agenda_cancel(_token)` → muda status e loga.

## 2. Server functions (`src/lib/agenda.functions.ts` + `agenda-public.functions.ts`)

Protegidas (`requireSupabaseAuth`):
- CRUD de business, serviços, profissionais, availability, blocks.
- Lista/edita appointments do calendário.
- CRUD de reengagement_campaigns.

Públicas (sem auth, usam server publishable client + RPCs SECURITY DEFINER):
- `getPublicBusinessFn(slug)`, `getPublicSlotsFn(...)`, `bookAppointmentFn(...)`, `confirmAppointmentFn(token, by)`, `cancelAppointmentFn(token)`.

## 3. Rotas

Privadas (sob `_authenticated/`):
- `/app/agenda` — calendário (semana/dia) com appointments, drag pra reagendar (fase 2 — MVP só lista).
- `/app/agenda/configurar` — dados do negócio, slug, instância WhatsApp default, offsets de lembrete.
- `/app/agenda/servicos` — CRUD serviços.
- `/app/agenda/profissionais` — CRUD profissionais + availability + blocks.
- `/app/agenda/reengajamento` — CRUD campanhas.

Públicas:
- `/agenda/$slug` — landing com serviços, escolha profissional → data → slot → form (nome + telefone) → confirma.
- `/agenda/confirmar/$token` — página com botões "Confirmar presença" / "Cancelar". Funciona tanto pro cliente quanto pro profissional.

## 4. Disparo automático (cron + worker)

- Server route `src/routes/api/public/hooks/agenda-dispatch.ts` (auth via `apikey` anon header). Lê `agenda_notifications` com `scheduled_at <= now()` e `status='queued'`, monta texto a partir do template, e envia via a função WhatsApp interna já usada pelas campanhas (`sendMessageFn` ou equivalente). Atualiza `sent_at`/`status`.
- pg_cron `*/1 * * * *` chamando esse endpoint.
- Mesmo endpoint roda um passo de reengajamento: pra cada `agenda_reengagement_campaigns.active=true` cuja cadência venceu, busca clientes elegíveis (telefones do CRM/appointments antigos) e enfileira notifications `kind='reengagement'`, gerando cupom dinâmico se configurado.

Mensagens padrão (editáveis depois):
- Cliente lembrete: "Oi {nome}, sua {servico} com {profissional} é {data} às {hora}. Confirma? {link}"
- Profissional lembrete: "Você tem {servico} com {cliente} em {data} {hora}. Confirma? {link}"
- Reengajamento: "Faz {dias} dias que você não passa aqui! Use o cupom {cupom} e marque: {link}"

## 5. Confirmação inbound (fase 2 — não nesta rodada)
Detectar resposta "sim/não" via webhook do WhatsApp e atualizar `agenda_notifications.status` + `appointment.status`. **MVP**: confirmação só pelo link clicável.

## 6. Integração com o resto do sistema

- Sidebar (`AppSidebar.tsx`): novo grupo "Agenda" com os itens acima.
- Plano: adicionar feature flag `has_agenda boolean` em `subscription_plans`; bloquear acesso se `false`.
- Cupons: campanha de reengajamento reaproveita `coupons` (tipo `percent`/`fixed`/`tool_credits`); admin já gerencia em `/app/admin/coupons`.

## Out of scope desta rodada
- Pagamento de sinal via Pix (deixar gancho — campo `requires_deposit` no service desligado).
- Auto-detectar confirmação por texto do WhatsApp.
- Multi-unidade (uma `agenda_business` por workspace por enquanto; modelo já permite expandir).
- Sincronização Google Calendar / iCal.
- Drag-and-drop no calendário (MVP: criar/editar via modal).

## Detalhes técnicos
- Slot calc no Postgres pra evitar round-trip; usa `tstzrange` + `EXCLUDE USING gist` em `agenda_appointments` (`professional_id`, `tstzrange(starts_at, ends_at)`) pra impedir overbooking concorrente.
- Página pública: `ssr: true` (não está sob `_authenticated/`), loader chama `getPublicBusinessFn` (server publishable client, policy `TO anon` em colunas seguras de `agenda_businesses`/`agenda_services`/`agenda_professionals`).
- Confirmação: token UUID v4 em `agenda_appointments.confirm_token`; rota pública valida e chama RPC `agenda_confirm` que faz lookup por token sem expor `auth.uid()`.

## Arquivos a criar/editar
- `supabase/migrations/<ts>_agenda.sql`
- `src/lib/agenda.functions.ts`, `src/lib/agenda-public.functions.ts`
- `src/routes/_authenticated/app.agenda.tsx` (+ `.configurar`, `.servicos`, `.profissionais`, `.reengajamento`)
- `src/routes/agenda.$slug.tsx`, `src/routes/agenda.confirmar.$token.tsx`
- `src/routes/api/public/hooks/agenda-dispatch.ts`
- `src/components/agenda/*` (CalendarView, ServiceForm, ProfessionalForm, AvailabilityEditor, PublicBookingFlow, ReengagementForm)
- `src/components/AppSidebar.tsx` (grupo Agenda)
- pg_cron schedule (via `supabase--insert`)
- Atualizar `mem://index.md` + criar `mem://features/agenda`
