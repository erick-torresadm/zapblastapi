// Worker chamado por pg_cron a cada 1min — processa fila chatwoot_sync_queue.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chatwoot-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // auth simples: header apikey = anon publishable key
        const apikey = request.headers.get("apikey");
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadChatwootConn, ensureInbox, ensureContactAndConversation, postChatwootMessage } =
          await import("@/lib/chatwoot.server");

        // pega lote (até 30) atomicamente
        const { data: batch, error: bErr } = await supabaseAdmin.rpc("consume_chatwoot_queue", { _limit: 30 });
        if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500 });
        const items = (batch ?? []) as Array<{ id: string; user_id: string; chat_message_id: string; attempts: number }>;

        let done = 0;
        let failed = 0;

        // cache de conn por user
        const connCache = new Map<string, Awaited<ReturnType<typeof loadChatwootConn>>>();

        for (const it of items) {
          try {
            let conn = connCache.get(it.user_id);
            if (conn === undefined) {
              conn = await loadChatwootConn(it.user_id);
              connCache.set(it.user_id, conn);
            }
            if (!conn) {
              await supabaseAdmin.from("chatwoot_sync_queue").update({
                status: "failed", last_error: "sem conexão",
              }).eq("id", it.id);
              failed++;
              continue;
            }

            // carrega mensagem
            const { data: msg } = await supabaseAdmin
              .from("chat_messages")
              .select("id, instance_id, contact_phone, contact_name, direction, text, message_type, media_url, from_chatwoot")
              .eq("id", it.chat_message_id)
              .maybeSingle();
            if (!msg) {
              await supabaseAdmin.from("chatwoot_sync_queue").update({
                status: "done", processed_at: new Date().toISOString(), last_error: "msg sumiu",
              }).eq("id", it.id);
              done++;
              continue;
            }
            if (msg.from_chatwoot) {
              await supabaseAdmin.from("chatwoot_sync_queue").update({
                status: "done", processed_at: new Date().toISOString(),
              }).eq("id", it.id);
              done++;
              continue;
            }

            // resolve instance name
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name")
              .eq("id", msg.instance_id)
              .maybeSingle();

            const inboxId = await ensureInbox(conn, msg.instance_id!, inst?.instance_name ?? "WhatsApp");
            if (!inboxId) throw new Error("ensureInbox falhou");

            const cc = await ensureContactAndConversation(conn, inboxId, msg.contact_phone!, msg.contact_name);
            if (!cc) throw new Error("ensureContactAndConversation falhou");

            const body = msg.text?.trim() ||
              (msg.media_url ? `[${msg.message_type ?? "mídia"}] ${msg.media_url}` : "(vazio)");
            const ok = await postChatwootMessage(conn, cc.conversation_id, body, msg.direction === "in" ? "in" : "out", msg.id);
            if (!ok) throw new Error("postChatwootMessage falhou");

            await supabaseAdmin.from("chatwoot_sync_queue").update({
              status: "done", processed_at: new Date().toISOString(), last_error: null,
            }).eq("id", it.id);
            done++;
          } catch (e) {
            failed++;
            await supabaseAdmin.from("chatwoot_sync_queue").update({
              status: it.attempts + 1 >= 5 ? "failed" : "pending",
              last_error: e instanceof Error ? e.message : String(e),
            }).eq("id", it.id);
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: items.length, done, failed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
