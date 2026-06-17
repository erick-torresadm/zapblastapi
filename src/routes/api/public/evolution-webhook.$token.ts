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
          const key = (data as { key?: { id?: string; remoteJid?: string; fromMe?: boolean; participant?: string; senderPn?: string } }).key;
          const fromMe = !!key?.fromMe;
          const remoteJid = key?.remoteJid ?? "";
          const senderPn = String((key as { senderPn?: string } | undefined)?.senderPn ?? "");
          const payloadSender = (payload as { sender?: string }).sender;

          const jidDomain = remoteJid.includes("@") ? remoteJid.split("@")[1] : "";
          const jidUser = remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid;
          let chatType: "user" | "group" | "lid" | "broadcast" | "other" = "other";
          if (jidDomain === "s.whatsapp.net" || jidDomain === "c.us") chatType = "user";
          else if (jidDomain === "g.us") chatType = "group";
          else if (jidDomain === "lid") chatType = "lid";
          else if (jidDomain === "broadcast" || jidUser === "status") chatType = "broadcast";

          // Para LID: tenta extrair telefone real de várias propriedades que a Evolution/Baileys pode enviar
          let resolvedJid = remoteJid;
          let resolvedUser = jidUser;
          const tryPn = (v: unknown): string | null => {
            if (!v) return null;
            const s = String(v);
            const u = s.includes("@") ? s.split("@")[0] : s;
            const d = u.replace(/[^0-9]/g, "");
            return d.length >= 8 && d.length <= 14 ? d : null;
          };
          if (chatType === "lid") {
            const participantPn = (key as { participantPn?: string } | undefined)?.participantPn;
            const dataPn = (data as { senderPn?: string; participantPn?: string; pn?: string; sender?: string });
            const pn =
              tryPn(senderPn) ?? tryPn(participantPn) ?? tryPn(dataPn.senderPn)
              ?? tryPn(dataPn.participantPn) ?? tryPn(dataPn.pn) ?? tryPn(dataPn.sender)
              // Em payloads Evolution com @lid, o telefone real costuma vir no topo como "sender".
              // Só usamos isso em mensagens recebidas; em fromMe pode ser o próprio chip.
              ?? (!fromMe ? tryPn(payloadSender) : null);
            if (pn) {
              chatType = "user";
              resolvedUser = pn;
              resolvedJid = `${pn}@s.whatsapp.net`;
              console.log("[webhook] LID resolvido", { remoteJid, resolvedJid });
            } else {
              // LID puro: não temos telefone real, mas mantemos como contato usando o próprio LID
              // para que o gatilho de palavra-chave ainda dispare. Envios voltam pelo JID @lid.
              chatType = "user";
              resolvedJid = remoteJid; // mantém @lid
              console.log("[webhook] LID sem telefone, usando LID como identificador", { remoteJid });
            }
          }

          const messageText =
            ((data as { message?: { conversation?: string; extendedTextMessage?: { text?: string } } }).message?.conversation)
            ?? ((data as { message?: { extendedTextMessage?: { text?: string } } }).message?.extendedTextMessage?.text)
            ?? null;

          console.log("[webhook] messages.upsert", {
            instance: instanceName, instanceId, chatType, fromMe,
            remoteJid, resolvedJid, hasText: !!messageText,
          });

          if (chatType !== "user") {
            console.log("[webhook] ignorado (não é 1:1)", chatType);
            return Response.json({ ok: true, skipped: chatType });
          }

          const fromPhone = resolvedUser.replace(/[^0-9]/g, "");
          if (!fromPhone || fromPhone.length < 8 || fromPhone.length > 18) {
            console.log("[webhook] ignorado (telefone inválido)", fromPhone);
            return Response.json({ ok: true, skipped: "invalid_phone" });
          }


          // Grava em chat_messages (CRM/Inbox)
          await supabaseAdmin.from("chat_messages").insert({
            user_id: server.user_id,
            instance_id: instanceId,
            contact_phone: fromPhone,
            contact_jid: resolvedJid,
            chat_type: chatType,
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

          // Dispara fluxo por palavra-chave (entrada OU saída, conforme allow_from_me do gatilho)
          try {
            const { triggerKeywordFlows } = await import("@/lib/flow-engine.server");
            const r = await triggerKeywordFlows(supabaseAdmin, {
              user_id: server.user_id,
              instance_id: instanceId,
              phone: fromPhone,
              text: messageText,
              from_me: fromMe,
            });
            console.log("[webhook] triggerKeywordFlows result", r);

            // Avança o run inline, respeitando exatamente os delays configurados.
            // Para delays curtos (<= 25s) aguardamos in-process; acima disso o cron assume.
            if (r.runs.length) {
              const { advanceFlowRun } = await import("@/lib/flow-engine.server");
              const MAX_TOTAL_MS = 25000;
              for (const runId of r.runs) {
                const started = Date.now();
                for (let i = 0; i < 50; i++) {
                  const { data: cur } = await supabaseAdmin.from("flow_runs")
                    .select("status, wait_until").eq("id", runId).maybeSingle();
                  if (!cur) break;
                  if (cur.status === "pending") {
                    await advanceFlowRun(supabaseAdmin, runId);
                    continue;
                  }
                  if (cur.status === "waiting" && cur.wait_until) {
                    const waitMs = new Date(cur.wait_until).getTime() - Date.now();
                    if (waitMs <= 0) { await advanceFlowRun(supabaseAdmin, runId); continue; }
                    if (Date.now() - started + waitMs > MAX_TOTAL_MS) break;
                    await new Promise((r) => setTimeout(r, waitMs + 50));
                    await advanceFlowRun(supabaseAdmin, runId);
                    continue;
                  }
                  break; // waiting_for resposta, completed, failed, etc.
                }
              }
            }

          } catch (e) {
            console.error("[webhook] triggerKeywordFlows failed", e);
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
