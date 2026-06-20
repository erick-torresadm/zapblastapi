// Worker que processa notifications da Agenda (booking_created, reminder, reengagement)
// Chamado por pg_cron a cada 1min. Bypassa auth via /api/public/*, valida apikey.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/agenda-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendText } = await import("@/lib/evolution.server");

        const origin = process.env.PUBLIC_APP_URL || "https://zapblastapi.lovable.app";

        // ============ 1) Gerar reminders de campanhas de reengajamento ============
        const { data: camps } = await supabaseAdmin
          .from("agenda_reengagement_campaigns")
          .select("*, agenda_businesses(id, owner_user_id, default_instance_id)")
          .eq("active", true);

        for (const c of camps ?? []) {
          const biz = c.agenda_businesses as { id: string; owner_user_id: string; default_instance_id: string | null } | null;
          if (!biz) continue;
          // cadência
          const cadenceDays = c.cadence === "every_7_days" ? 7 : c.cadence === "every_15_days" ? 15 : 30;
          if (c.last_run_at && new Date(c.last_run_at).getTime() > Date.now() - cadenceDays * 86400_000) continue;

          // contatos elegíveis: telefones de appointments antigos do negócio,
          // sem appointment recente nos últimos `inactive_days` dias.
          const cutoff = new Date(Date.now() - c.inactive_days * 86400_000).toISOString();
          const { data: oldClients } = await supabaseAdmin
            .from("agenda_appointments")
            .select("customer_phone, customer_name")
            .eq("business_id", biz.id)
            .lt("starts_at", cutoff)
            .in("status", ["done", "confirmed", "confirmed_customer", "confirmed_pro"]);
          const phones = new Map<string, string>();
          for (const r of oldClients ?? []) phones.set(r.customer_phone, r.customer_name);

          // remove quem tem appointment recente
          if (phones.size) {
            const { data: recent } = await supabaseAdmin
              .from("agenda_appointments")
              .select("customer_phone")
              .eq("business_id", biz.id)
              .gte("starts_at", cutoff)
              .in("customer_phone", Array.from(phones.keys()));
            for (const r of recent ?? []) phones.delete(r.customer_phone);
          }

          for (const [phone, name] of phones) {
            const msg = (c.message_template || "")
              .replaceAll("{nome}", name)
              .replaceAll("{cupom}", c.coupon_code || "")
              .replaceAll("{link}", `${origin}/agenda/`);
            await supabaseAdmin.from("agenda_notifications").insert({
              owner_user_id: biz.owner_user_id,
              business_id: biz.id,
              appointment_id: null,
              kind: "reengagement",
              target: "customer",
              phone,
              instance_id: biz.default_instance_id,
              message_text: msg,
              scheduled_at: new Date().toISOString(),
              status: "queued",
            });
          }
          await supabaseAdmin
            .from("agenda_reengagement_campaigns")
            .update({ last_run_at: new Date().toISOString() })
            .eq("id", c.id);
        }

        // ============ 2) Processar fila de notifications ============
        const { data: queued } = await supabaseAdmin
          .from("agenda_notifications")
          .select(`
            id, kind, target, phone, message_text, appointment_id, instance_id, owner_user_id, business_id,
            agenda_businesses(name, slug, default_instance_id),
            agenda_appointments(id, starts_at, customer_name, confirm_token,
              agenda_services(name), agenda_professionals(name))
          `)
          .eq("status", "queued")
          .lte("scheduled_at", new Date().toISOString())
          .order("scheduled_at")
          .limit(40);

        let sent = 0, failed = 0;
        const instanceCache = new Map<string, { server: { base_url: string; api_key: string }; instance_name: string } | null>();

        for (const n of queued ?? []) {
          const biz = n.agenda_businesses as { name: string; slug: string; default_instance_id: string | null } | null;
          const appt = n.agenda_appointments as { starts_at: string; customer_name: string; confirm_token: string; agenda_services: { name: string } | null; agenda_professionals: { name: string } | null } | null;
          const instanceId = n.instance_id || biz?.default_instance_id || null;
          if (!instanceId) {
            await supabaseAdmin.from("agenda_notifications")
              .update({ status: "failed", error: "Sem instância WhatsApp configurada" }).eq("id", n.id);
            failed++; continue;
          }

          if (!instanceCache.has(instanceId)) {
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name, evolution_servers(base_url, api_key)")
              .eq("id", instanceId).maybeSingle();
            const srv = inst?.evolution_servers as { base_url: string; api_key: string } | null;
            instanceCache.set(instanceId, srv && inst ? { server: srv, instance_name: inst.instance_name } : null);
          }
          const cached = instanceCache.get(instanceId);
          if (!cached) {
            await supabaseAdmin.from("agenda_notifications")
              .update({ status: "failed", error: "Instância não encontrada" }).eq("id", n.id);
            failed++; continue;
          }

          // monta mensagem
          let text = n.message_text || "";
          if (!text && appt) {
            const dt = new Date(appt.starts_at);
            const dtStr = dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
            const link = `${origin}/agenda/confirmar/${appt.confirm_token}`;
            const svc = appt.agenda_services?.name || "atendimento";
            const pro = appt.agenda_professionals?.name || "";
            if (n.kind === "booking_created") {
              text = `Olá ${appt.customer_name}! Seu agendamento de ${svc}${pro ? ` com ${pro}` : ""} foi recebido para ${dtStr}. Confirme aqui: ${link}`;
            } else if (n.kind === "reminder" && n.target === "customer") {
              text = `Oi ${appt.customer_name}, lembrando do seu ${svc}${pro ? ` com ${pro}` : ""} em ${dtStr}. Confirma presença? ${link}`;
            } else if (n.kind === "reminder" && n.target === "professional") {
              text = `Lembrete: você tem ${svc} com ${appt.customer_name} em ${dtStr}. Confirme: ${link}`;
            }
          }

          if (!text) {
            await supabaseAdmin.from("agenda_notifications")
              .update({ status: "failed", error: "Mensagem vazia" }).eq("id", n.id);
            failed++; continue;
          }

          try {
            const res = await sendText(cached.server, cached.instance_name, n.phone, text);
            await supabaseAdmin.from("agenda_notifications").update({
              status: "sent",
              sent_at: new Date().toISOString(),
              wa_message_id: (res as { key?: { id?: string } })?.key?.id ?? null,
              message_text: text,
            }).eq("id", n.id);
            sent++;
          } catch (e) {
            await supabaseAdmin.from("agenda_notifications").update({
              status: "failed",
              error: e instanceof Error ? e.message : String(e),
              message_text: text,
            }).eq("id", n.id);
            failed++;
          }
        }

        return Response.json({ ok: true, sent, failed, queued: queued?.length ?? 0 });
      },
    },
  },
});
