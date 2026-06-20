---
name: Tráfego & Funis
description: Módulo de funil/link-bio com Pixel+CAPI, GA4/GTM e domínio próprio via CNAME — totalmente isolado do core
type: feature
---

## Visão geral
Módulo novo prefixo `traffic_*`, isolado do CRM/Agenda/Campaigns. Permite criar funis/link-bio, instalar Pixel + CAPI Facebook (server-side dedupe via event_id) e GA4/GTM. Cliente pode usar domínio próprio via CNAME para não queimar `zapblastapi.lovable.app` em Ads.

## Tabelas
- `traffic_funnels` (owner_user_id, slug único, status draft/published, template funnel|linkbio, settings jsonb com `pixel_id`+`capi_token`+`ga4_id`+`gtm_id`, default_list_id, custom_domain, primary_color, font_family, seo_*)
- `traffic_blocks` (funnel_id, position, type, props jsonb) — tipos: headline, text, image, video, button-whatsapp, button-link, button-agenda, form, testimonial, faq, spacer
- `traffic_events` (funnel_id, event_name, event_id, anonymous_id, fbp, fbc, ip_hash, ua, payload, capi_status) — indexada por (funnel_id, created_at DESC)
- `traffic_leads` (funnel_id, name, phone, email, utm, pushed_to_list_id) — auto-push para `contacts` quando default_list_id setado
- `traffic_custom_domains` (funnel_id, host único, verify_token, dns_ok, ssl_ok)

## RPCs públicas (SECURITY DEFINER)
- `get_published_funnel_by_slug(_slug)` / `get_published_funnel_by_host(_host)` — retorna funnel+blocks, strip de `capi_token`
- `log_traffic_event(...)` — insere evento (chamada de `/api/public/traffic-event`)
- `submit_traffic_lead(...)` — grava lead + INSERT em `contacts` (user_id = owner_user_id) com try/catch
- `mark_traffic_domain_verified(host, token)` — marca dns_ok=true e espelha em `traffic_funnels.custom_domain`

## Endpoints públicos
- `/f/$slug` — render SSR público (via supabase publishable key + RPC)
- `/api/public/traffic-event` — recebe evento, grava e dispara CAPI Graph v20 (deduplicação via event_id compartilhado client/server)
- `/api/public/traffic-lead` — grava lead via RPC

## UI
- `/app/traffic` — dashboard (lista, criar com slug+template)
- `/app/traffic/$id/editor` — editor com tabs: Editor (blocos com ↑↓), Design, Tracking (Pixel/CAPI/GA4/GTM), Leads (escolhe lista CRM), Domínio, SEO, Publicar
- `/app/traffic/$id/analytics` — totais por evento (30d) + leads + últimos eventos

## Domínio customizado
- 1 host por funil (MVP)
- Instruções DNS: CNAME → zapblastapi.lovable.app + TXT `_zapblast-verify.{sub}` = verify_token
- Verificação via DoH Cloudflare 1.1.1.1
- SSL: usuário coloca Cloudflare grátis na frente (sem Cloudflare-for-SaaS no MVP)

## Tracking client
- `src/components/traffic/tracking.ts` — função `trackEvent(slug, name, payload)` injeta no Pixel (com eventID), GA4 (gtag) e POST para `/api/public/traffic-event` com fbp/fbc cookies, anonymous_id em localStorage
- PageView automático no mount; Lead no form; Contact no botão WhatsApp; Schedule no botão Agenda; ClickButton no botão link

## Sidebar
Item "Tráfego & Funis" (ícone Megaphone) entre Agenda e Equipe.
