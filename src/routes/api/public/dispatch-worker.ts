// Worker que processa a fila de mensagens. Chamado por pg_cron a cada 10s.
// Bypassa auth pois roda em /api/public/*. Usa apikey header como verificação básica.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/dispatch-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendText, sendMedia } = await import("@/lib/evolution.server");

        // 1) Reset diário de sent_today
        await supabaseAdmin.from("whatsapp_instances")
          .update({ sent_today: 0, last_reset_date: new Date().toISOString().slice(0, 10) })
          .lt("last_reset_date", new Date().toISOString().slice(0, 10));

        // 2) Promove campanhas agendadas que chegaram a hora
        await supabaseAdmin.from("campaigns")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString());

        // 3) Marca campanhas que terminaram (sem mensagens pending)
        const { data: runningCamps } = await supabaseAdmin.from("campaigns")
          .select("id, total_messages, sent_count, failed_count")
          .eq("status", "running");
        for (const c of runningCamps ?? []) {
          const { count } = await supabaseAdmin.from("campaign_messages")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .eq("status", "pending");
          if ((count ?? 0) === 0) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", c.id);
          }
        }

        // 4) Pega até 30 mensagens pending de campanhas em execução
        const { data: pending } = await supabaseAdmin
          .from("campaign_messages")
          .select("*, campaigns!inner(status, min_delay_s, max_delay_s, instance_ids, media_url, media_type, media_filename, flow_id)")
          .eq("status", "pending")
          .eq("campaigns.status", "running")
          .order("created_at", { ascending: true })
          .limit(30);


        let sent = 0, failed = 0, skipped = 0;
        const instanceCache: Record<string, { server: { base_url: string; api_key: string }; instance_name: string; sent_today: number; daily_limit: number; last_sent_at: string | null; status: string }> = {};

        for (const msg of pending ?? []) {
          const camp = msg.campaigns as { min_delay_s: number; max_delay_s: number; instance_ids: string[]; media_url: string | null; media_type: string | null; media_filename: string | null; flow_id: string | null };
          // Carrega chips elegíveis
          const candidateIds = camp.instance_ids ?? [];
          if (!candidateIds.length) { skipped++; continue; }

          // Hidrata cache
          const toFetch = candidateIds.filter((id) => !instanceCache[id]);
          if (toFetch.length) {
            const { data: insts } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("id, instance_name, sent_today, daily_limit, last_sent_at, status, evolution_servers(base_url, api_key)")
              .in("id", toFetch);
            for (const i of insts ?? []) {
              const srv = i.evolution_servers as { base_url: string; api_key: string } | null;
              if (!srv) continue;
              instanceCache[i.id] = {
                server: { base_url: srv.base_url, api_key: srv.api_key },
                instance_name: i.instance_name,
                sent_today: i.sent_today,
                daily_limit: i.daily_limit,
                last_sent_at: i.last_sent_at,
                status: i.status,
              };
            }
          }

          // Escolhe chip: connected + sent<limit + delay passado, ordenado pelo last_sent_at mais antigo
          const now = Date.now();
          const eligible = candidateIds
            .map((id) => ({ id, ...instanceCache[id] }))
            .filter((i) => i && i.status === "connected" && i.sent_today < i.daily_limit)
            .filter((i) => {
              if (!i.last_sent_at) return true;
              const delay = (camp.min_delay_s + Math.random() * (camp.max_delay_s - camp.min_delay_s)) * 1000;
              return now - new Date(i.last_sent_at).getTime() >= delay;
            })
            .sort((a, b) => (new Date(a.last_sent_at ?? 0).getTime()) - (new Date(b.last_sent_at ?? 0).getTime()));

          if (!eligible.length) { skipped++; continue; }
          const chip = eligible[0];

          // Marca sending
          await supabaseAdmin.from("campaign_messages").update({ status: "sending", instance_id: chip.id, attempts: msg.attempts + 1 }).eq("id", msg.id);

          try {
            let evoRes: Record<string, unknown>;
            if (camp.media_url && camp.media_type) {
              const mt = camp.media_type as "image" | "video" | "audio" | "document";
              evoRes = await sendMedia(chip.server, chip.instance_name, msg.phone, {
                mediatype: mt,
                media: camp.media_url,
                caption: msg.rendered_message,
                fileName: camp.media_filename ?? undefined,
              });
            } else {
              evoRes = await sendText(chip.server, chip.instance_name, msg.phone, msg.rendered_message);
            }
            const evoId = (evoRes as { key?: { id?: string } })?.key?.id
              ?? (evoRes as { messageId?: string })?.messageId ?? null;

            await supabaseAdmin.from("campaign_messages").update({
              status: "sent",
              evolution_message_id: evoId,
              sent_at: new Date().toISOString(),
            }).eq("id", msg.id);

            const newSent = chip.sent_today + 1;
            await supabaseAdmin.from("whatsapp_instances").update({
              sent_today: newSent, last_sent_at: new Date().toISOString(),
            }).eq("id", chip.id);
            instanceCache[chip.id].sent_today = newSent;
            instanceCache[chip.id].last_sent_at = new Date().toISOString();

            await supabaseAdmin.from("campaigns")
              .update({ sent_count: (await supabaseAdmin.from("campaigns").select("sent_count").eq("id", msg.campaign_id).single()).data!.sent_count + 1 })
              .eq("id", msg.campaign_id);
            sent++;
          } catch (e) {
            const errMsg = (e as Error).message;
            await supabaseAdmin.from("campaign_messages").update({
              status: "failed", error: errMsg.slice(0, 500),
            }).eq("id", msg.id);
            await supabaseAdmin.from("campaigns")
              .update({ failed_count: (await supabaseAdmin.from("campaigns").select("failed_count").eq("id", msg.campaign_id).single()).data!.failed_count + 1 })
              .eq("id", msg.campaign_id);
            failed++;
          }
        }

        return Response.json({ processed: (pending ?? []).length, sent, failed, skipped });
      },
    },
  },
});
