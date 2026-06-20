---
name: Agenda
description: Módulo de agendamento — booking público por slug, confirmações automáticas via WhatsApp, reengajamento programado
type: feature
---

# Módulo Agenda

Tenant = `agenda_businesses.owner_user_id`. Workspace CRM (crm_agents) tem acesso.

## Tabelas
- `agenda_businesses` (slug único, `confirm_offsets_minutes int[]` ex `{1440,120}`, `default_instance_id` → whatsapp_instances)
- `agenda_professionals`, `agenda_services`, `agenda_service_professionals` (N×N)
- `agenda_availability` (weekday 0-6 + start/end_time)
- `agenda_blocks` (folgas pontuais)
- `agenda_appointments` (status: pending|confirmed_customer|confirmed_pro|confirmed|cancelled|no_show|done, `confirm_token uuid`, EXCLUDE gist anti-overbooking por profissional ignorando cancelled/no_show)
- `agenda_notifications` (fila: booking_created|reminder|reengagement, status queued|sent|failed|cancelled, ordenada por scheduled_at)
- `agenda_reengagement_campaigns` (cadence every_7/15/30_days, inactive_days, message_template com {nome}{cupom}{link}, last_run_at)

## RPCs públicas (SECURITY DEFINER, GRANT EXECUTE TO anon, authenticated)
- `agenda_public_get_business(slug)` — dados públicos
- `agenda_public_get_slots(business_id, service_id, professional_id, date)` — calcula slots livres
- `agenda_public_book(...)` — cria appointment + enfileira booking_created e reminders pra cliente e profissional
- `agenda_public_get_by_token(token)` / `agenda_public_confirm(token, by)` / `agenda_public_cancel(token)`

## Server functions
- `src/lib/agenda.functions.ts` — CRUD protegido (requireSupabaseAuth)
- `src/lib/agenda-public.functions.ts` — wrappers das RPCs públicas usando server publishable client

## Rotas
- Privada: `/app/agenda` (tabs: Agenda/Serviços/Equipe/Reengaja/Config)
- Públicas: `/agenda/$slug` (booking flow), `/agenda/confirmar/$token` (?by=customer|professional)

## Worker
- `src/routes/api/public/agenda-dispatch.ts` (auth via apikey header)
- pg_cron `agenda-dispatch-every-minute` (`* * * * *`)
- Processa até 40 notifications queued por execução; também gera reengajamento conforme cadência

## Plano
`subscription_plans.has_agenda boolean` (default true) — flag pra liberar/bloquear (gating ainda não implementado no UI).
