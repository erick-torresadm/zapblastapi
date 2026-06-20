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

        const rawPayload = await request.json().catch(() => ({})) as Record<string, unknown>;
        const { parseWebhookEnvelope, EVOLUTION_CONNECTION_STATE_MAP } = await import("@/lib/evolution-webhook.server");
        const envelope = parseWebhookEnvelope(rawPayload);
        const { event, kind, instanceName, data, key, remoteJid, jidUser } = envelope;
        let { chatType } = envelope;
        const fromMe = envelope.fromMe;

        // Localiza chip pelo nome
        let instanceId: string | null = null;
        if (instanceName) {
          const { data: inst } = await supabaseAdmin.from("whatsapp_instances")
            .select("id").eq("server_id", server.id).eq("instance_name", instanceName).maybeSingle();
          instanceId = inst?.id ?? null;
        }

        if (kind === "connection.update") {
          const state = String((data as { state?: string }).state ?? "");
          const newStatus = EVOLUTION_CONNECTION_STATE_MAP[state];
          if (newStatus && instanceId) {
            const patch: { status: typeof newStatus; last_qr_base64?: null; last_qr_error?: null } = { status: newStatus };
            if (newStatus === "connected") { patch.last_qr_base64 = null; patch.last_qr_error = null; }
            await supabaseAdmin.from("whatsapp_instances").update(patch).eq("id", instanceId);
          }
        }

        if (kind === "qrcode.updated") {
          if (instanceId) {
            const { normalizeQr } = await import("@/lib/evolution-qr.server");
            const qrPayload = (rawPayload as { qrcode?: unknown }).qrcode ?? data;
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

        if (kind === "messages.upsert") {

          // Resolução robusta do telefone real do contato.
          // 1) Campos do próprio payload (remoteJid/remoteJidAlt em @s.whatsapp.net,
          //    senderPn / participantPn / pn em key, data, contextInfo).
          // 2) Histórico no banco: mesma @lid já apareceu junto com telefone real.
          const { extractPhoneFromPayload, resolveLidFromHistory } = await import("@/lib/lid-resolver.server");

          let realPhone = extractPhoneFromPayload(rawPayload);
          let lidResolutionSource: "payload" | "history" | null = realPhone ? "payload" : null;

          // Garante o número quando remoteJid já é @s.whatsapp.net
          if (!realPhone && chatType === "user") {
            const d = jidUser.replace(/\D/g, "");
            if (d.length >= 8 && d.length <= 14) realPhone = d;
          }

          let resolvedJid = remoteJid;
          let isUnresolvedLid = false;
          if (chatType === "lid") {
            if (!realPhone) {
              // Tenta o histórico (mapeamento @lid → telefone visto antes)
              const fromHistory = await resolveLidFromHistory(supabaseAdmin, {
                user_id: server.user_id,
                instance_id: instanceId,
                lid_jid: remoteJid,
              });
              if (fromHistory) {
                realPhone = fromHistory.phone;
                lidResolutionSource = "history";
                console.log("[webhook] LID resolvido via histórico", { remoteJid, phone: realPhone });
              }
            }
            if (realPhone) {
              chatType = "user";
              resolvedJid = `${realPhone}@s.whatsapp.net`;
              if (lidResolutionSource === "payload") {
                console.log("[webhook] LID resolvido via payload", { remoteJid, resolvedJid });
              }
            } else {
              // LID sem telefone — mantém como contato para o histórico de chat
              // mas marcamos para NÃO disparar fluxos (envio falharia 400).
              chatType = "user";
              isUnresolvedLid = true;
              console.log("[webhook] LID sem telefone, contato não enviável", { remoteJid });
            }
          }

          if (chatType !== "user") {
            console.log("[webhook] ignorado (não é 1:1)", chatType);
            return Response.json({ ok: true, skipped: chatType });
          }

          const fromPhone = realPhone ?? jidUser.replace(/[^0-9]/g, "");
          if (!fromPhone || fromPhone.length < 8 || fromPhone.length > 18) {
            console.log("[webhook] ignorado (telefone inválido)", fromPhone);
            return Response.json({ ok: true, skipped: "invalid_phone" });
          }

          // ----- Extrai texto e/ou mídia -----
          type WaMsg = {
            conversation?: string;
            extendedTextMessage?: { text?: string };
            imageMessage?: { caption?: string; mimetype?: string; fileLength?: number | string };
            videoMessage?: { caption?: string; mimetype?: string; fileLength?: number | string; seconds?: number };
            audioMessage?: { mimetype?: string; fileLength?: number | string; seconds?: number; ptt?: boolean };
            documentMessage?: { caption?: string; mimetype?: string; fileLength?: number | string; fileName?: string; title?: string };
            documentWithCaptionMessage?: { message?: WaMsg };
            stickerMessage?: { mimetype?: string; fileLength?: number | string };
            reactionMessage?: { text?: string; key?: { id?: string } };
          };
          let waMsg = ((data as { message?: WaMsg }).message) ?? {};
          if (waMsg.documentWithCaptionMessage?.message) {
            waMsg = { ...waMsg, ...waMsg.documentWithCaptionMessage.message };
          }

          const messageText =
            waMsg.conversation
            ?? waMsg.extendedTextMessage?.text
            ?? null;

          let mediaType: "image" | "video" | "audio" | "document" | "sticker" | null = null;
          let mediaMime: string | undefined;
          let mediaSize: number | undefined;
          let mediaFilename: string | undefined;
          let caption: string | undefined;
          let durationSeconds: number | undefined;
          let isPtt = false;
          let reaction: string | undefined;

          const num = (v: number | string | undefined) => {
            if (v == null) return undefined;
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? n : undefined;
          };

          if (waMsg.imageMessage) {
            mediaType = "image"; mediaMime = waMsg.imageMessage.mimetype;
            mediaSize = num(waMsg.imageMessage.fileLength); caption = waMsg.imageMessage.caption;
          } else if (waMsg.videoMessage) {
            mediaType = "video"; mediaMime = waMsg.videoMessage.mimetype;
            mediaSize = num(waMsg.videoMessage.fileLength); caption = waMsg.videoMessage.caption;
            durationSeconds = waMsg.videoMessage.seconds;
          } else if (waMsg.audioMessage) {
            mediaType = "audio"; mediaMime = waMsg.audioMessage.mimetype;
            mediaSize = num(waMsg.audioMessage.fileLength);
            durationSeconds = waMsg.audioMessage.seconds; isPtt = !!waMsg.audioMessage.ptt;
          } else if (waMsg.documentMessage) {
            mediaType = "document"; mediaMime = waMsg.documentMessage.mimetype;
            mediaSize = num(waMsg.documentMessage.fileLength);
            mediaFilename = waMsg.documentMessage.fileName ?? waMsg.documentMessage.title;
            caption = waMsg.documentMessage.caption;
          } else if (waMsg.stickerMessage) {
            mediaType = "sticker"; mediaMime = waMsg.stickerMessage.mimetype;
            mediaSize = num(waMsg.stickerMessage.fileLength);
          } else if (waMsg.reactionMessage) {
            reaction = waMsg.reactionMessage.text;
          }

          let mediaUrl: string | null = null;
          if (mediaType) {
            try {
              const { data: srv } = await supabaseAdmin
                .from("evolution_servers").select("base_url, api_key").eq("id", server.id).maybeSingle();
              if (srv?.base_url && srv?.api_key) {
                const { getBase64FromMediaMessage } = await import("@/lib/evolution.server");
                const got = await getBase64FromMediaMessage(
                  { base_url: srv.base_url, api_key: srv.api_key },
                  instanceName,
                  { key: key!, message: waMsg as unknown },
                );
                if (got?.base64) {
                  const ext = (got.mimetype ?? mediaMime ?? "").split("/")[1]?.split(";")[0] ?? "bin";
                  const fname = mediaFilename ?? `${Date.now()}-${key?.id ?? "msg"}.${ext}`;
                  const path = `${server.user_id}/${fromPhone}/${fname}`;
                  const bin = Uint8Array.from(atob(got.base64), (c) => c.charCodeAt(0));
                  const { error: upErr } = await supabaseAdmin.storage.from("crm-media").upload(path, bin, {
                    contentType: got.mimetype ?? mediaMime ?? "application/octet-stream",
                    upsert: true,
                  });
                  if (!upErr) mediaUrl = path;
                  else console.warn("[webhook] upload mídia falhou", upErr);
                  if (!mediaMime && got.mimetype) mediaMime = got.mimetype;
                  if (!mediaFilename && got.fileName) mediaFilename = got.fileName;
                }
              }
            } catch (e) {
              console.warn("[webhook] download mídia falhou", e);
            }
          }

          // Reação: atualiza msg existente sem inserir nova linha
          if (reaction !== undefined && waMsg.reactionMessage?.key?.id) {
            await supabaseAdmin.from("chat_messages").update({ reaction })
              .eq("evolution_message_id", waMsg.reactionMessage.key.id);
            return Response.json({ ok: true, reaction: true });
          }

          console.log("[webhook] messages.upsert", {
            instance: instanceName, instanceId, chatType, fromMe, mediaType,
          });

          // Se a Evolution acabou de entregar uma mensagem desse chip, ele está ativo
          // mesmo que o último CONNECTION_UPDATE tenha deixado o status local como desconectado.
          // Sem isso, o fluxo pode ser criado mas não responder porque o motor bloqueia envios
          // quando a instância parece offline no banco.
          if (instanceId) {
            await supabaseAdmin.from("whatsapp_instances").update({
              status: "connected",
              last_qr_base64: null,
              last_qr_error: null,
            }).eq("id", instanceId).neq("status", "connected");
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
            media_type: mediaType,
            media_url: mediaUrl,
            media_mime: mediaMime,
            media_filename: mediaFilename,
            media_size: mediaSize,
            caption,
            duration_seconds: durationSeconds,
            is_ptt: isPtt,
          });

          if (!fromMe) {
            // Idempotência: tenta inserir; unique index (user_id, instance_id, evolution_message_id)
            // bloqueia duplicatas e nesse caso pulamos o disparo de trigger.
            const { error: incErr } = await supabaseAdmin.from("incoming_messages").insert({
              user_id: server.user_id,
              instance_id: instanceId,
              from_phone: fromPhone,
              message_text: messageText,
              evolution_message_id: key?.id ?? null,
              raw_payload: payload as never,
            });
            const isDuplicate = !!incErr && /duplicate key|uq_incoming_messages_evo_id|23505/i.test(String(incErr.message));
            if (incErr && !isDuplicate) {
              console.warn("[webhook] insert incoming_messages erro", incErr);
            }
            if (isDuplicate) {
              console.log("[webhook] mensagem duplicada — ignorando trigger", key?.id);
              return Response.json({ ok: true, duplicate: true });
            }

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
              remote_jid: remoteJid,
              unresolved_lid: isUnresolvedLid,
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
                  break;
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

        // Indicador de "digitando" / "gravando" / online
        if (ev.includes("presence.update") || ev === "presence_update") {
          const id = String((data as { id?: string }).id ?? "");
          const phone = id.includes("@") ? id.split("@")[0].replace(/\D/g, "") : id.replace(/\D/g, "");
          const presences = (data as { presences?: Record<string, { lastKnownPresence?: string }> }).presences;
          let presence: string | null = null;
          if (presences) {
            const first = Object.values(presences)[0];
            presence = first?.lastKnownPresence ?? null;
          }
          if (phone && presence) {
            await supabaseAdmin.from("crm_conversations")
              .update({ presence, presence_at: new Date().toISOString() })
              .eq("owner_user_id", server.user_id)
              .eq("contact_phone", phone);
          }
        }



        return Response.json({ ok: true });
      },
    },
  },
});
