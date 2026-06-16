// Webhook recebido do Evolution API. URL: /api/public/evolution-webhook/{webhook_token}
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution-webhook/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { token } = params;
        if (!token || token.length < 20) return new Response("invalid token", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: server } = await supabaseAdmin.from("evolution_servers").select("id, user_id").eq("webhook_token", token).maybeSingle();
        if (!server) return new Response("unknown token", { status: 401 });

        const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
        const event = String(payload.event ?? payload.type ?? "");
        const instanceName = String(payload.instance ?? (payload as { instanceName?: string }).instanceName ?? "");

        // Localiza chip pelo nome
        let instanceId: string | null = null;
        if (instanceName) {
          const { data: inst } = await supabaseAdmin.from("whatsapp_instances")
            .select("id").eq("server_id", server.id).eq("instance_name", instanceName).maybeSingle();
          instanceId = inst?.id ?? null;
        }

        const data = (payload.data ?? payload) as Record<string, unknown>;
        const ev = event.toLowerCase();

        if (ev.includes("connection.update") || ev === "connection_update") {
          const state = String((data as { state?: string }).state ?? "");
          const statusMap: Record<string, "connected" | "disconnected" | "connecting"> = {
            open: "connected", close: "disconnected", connecting: "connecting",
          };
          const newStatus = statusMap[state];
          if (newStatus && instanceId) {
            const patch: { status: typeof newStatus; last_qr_base64?: null; last_qr_error?: null } = { status: newStatus };
            if (newStatus === "connected") { patch.last_qr_base64 = null; patch.last_qr_error = null; }
            await supabaseAdmin.from("whatsapp_instances").update(patch).eq("id", instanceId);
          }
        }

        if (ev.includes("qrcode.updated") || ev === "qrcode_updated") {
          if (instanceId) {
            const { normalizeQr } = await import("@/lib/evolution-qr.server");
            const qrPayload = (payload as { qrcode?: unknown }).qrcode ?? data;
            const base64 = await normalizeQr(qrPayload);
            if (base64) {
              await supabaseAdmin.from("whatsapp_instances").update({
                last_qr_base64: base64,
                last_qr_at: new Date().toISOString(),
                last_qr_error: null,
                status: "connecting",
              }).eq("id", instanceId);
            }
          }
        }

        if (event.includes("messages.upsert") || event === "MESSAGES_UPSERT") {
          const key = (data as { key?: { id?: string; remoteJid?: string; fromMe?: boolean } }).key;
          const fromMe = !!key?.fromMe;
          const remoteJid = key?.remoteJid ?? "";
          const fromPhone = remoteJid.replace(/@.*/, "");
          const messageText =
            ((data as { message?: { conversation?: string; extendedTextMessage?: { text?: string } } }).message?.conversation)
            ?? ((data as { message?: { extendedTextMessage?: { text?: string } } }).message?.extendedTextMessage?.text)
            ?? null;

          if (fromPhone) {
            // Grava em chat_messages (CRM/Inbox)
            await supabaseAdmin.from("chat_messages").insert({
              user_id: server.user_id,
              instance_id: instanceId,
              contact_phone: fromPhone,
              direction: fromMe ? "out" : "in",
              text: messageText,
              evolution_message_id: key?.id ?? null,
              status: "delivered",
            });

            if (!fromMe) {
              await supabaseAdmin.from("incoming_messages").insert({
                user_id: server.user_id,
                instance_id: instanceId,
                from_phone: fromPhone,
                message_text: messageText,
                evolution_message_id: key?.id ?? null,
                raw_payload: payload as never,
              });

              await supabaseAdmin.from("campaign_messages")
                .update({ status: "replied" })
                .eq("user_id", server.user_id)
                .eq("phone", fromPhone)
                .in("status", ["sent", "delivered", "read"]);

              const { resumeFlowRunsForReply } = await import("@/lib/flow-engine.server");
              await resumeFlowRunsForReply(supabaseAdmin, {
                user_id: server.user_id, phone: fromPhone, text: messageText,
              });

              const txt = (messageText ?? "").trim().toUpperCase();
              if (["PARAR", "SAIR", "STOP", "CANCELAR", "REMOVER"].includes(txt)) {
                await supabaseAdmin.from("opt_outs").insert({
                  user_id: server.user_id, phone: fromPhone, reason: "auto: " + txt,
                }).select().maybeSingle();
                await supabaseAdmin.from("contacts").update({ opted_out: true })
                  .eq("user_id", server.user_id).eq("phone", fromPhone);
              }
            }

            // Dispara fluxo por palavra-chave para qualquer mensagem (in OU out)
            // fromMe=true permite que o próprio admin/usuário "comande" o disparo enviando a palavra-chave
            // pelo WhatsApp dele ao contato.
            try {
              const { triggerKeywordFlows } = await import("@/lib/flow-engine.server");
              await triggerKeywordFlows(supabaseAdmin, {
                user_id: server.user_id,
                instance_id: instanceId,
                phone: fromPhone,
                text: messageText,
                from_me: fromMe,
              });
            } catch (e) {
              console.error("triggerKeywordFlows failed", e);
            }
          }
        }


        if (event.includes("messages.update") || event === "MESSAGES_UPDATE") {
          const arr = Array.isArray(data) ? data : [data];
          for (const item of arr as Array<Record<string, unknown>>) {
            const key = (item.key as { id?: string } | undefined);
            const status = String((item as { status?: string }).status ?? "");
            if (!key?.id) continue;
            const update: { status?: "delivered" | "read"; delivered_at?: string; read_at?: string } = {};
            if (status === "DELIVERY_ACK") { update.status = "delivered"; update.delivered_at = new Date().toISOString(); }
            if (status === "READ") { update.status = "read"; update.read_at = new Date().toISOString(); }
            if (Object.keys(update).length) {
              await supabaseAdmin.from("campaign_messages").update(update).eq("evolution_message_id", key.id);
            }
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
