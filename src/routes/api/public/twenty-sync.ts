// Worker chamado por pg_cron: processa fila twenty_sync_queue.
// Pra cada mensagem pendente: garante a pessoa no Twenty e cria uma nota linkada.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twenty-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || apikey !== expected) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadTwentyConn, ensureTwentyPerson, postTwentyNote } = await import("@/lib/twenty.server");

        const { data: items, error } = await supabaseAdmin
          .from("twenty_sync_queue")
          .select("id, user_id, chat_message_id, attempts")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        // agrupa por user pra cache da conexão
        const byUser = new Map<string, typeof items>();
        for (const it of items ?? []) {
          const arr = byUser.get(it.user_id) ?? [];
          arr.push(it);
          byUser.set(it.user_id, arr);
        }

        let done = 0, failed = 0;
        for (const [userId, group] of byUser) {
          const conn = await loadTwentyConn(userId);
          if (!conn) {
            // user desativou → marca todos failed pra não ficar reciclando
            for (const it of group ?? []) {
              await supabaseAdmin.from("twenty_sync_queue").update({
                status: "failed", attempts: (it.attempts ?? 0) + 1, last_error: "no active connection",
              }).eq("id", it.id);
              failed++;
            }
            continue;
          }

          for (const it of group ?? []) {
            try {
              const { data: msg } = await supabaseAdmin
                .from("chat_messages")
                .select("contact_phone, text, caption, direction, created_at, media_type")
                .eq("id", it.chat_message_id)
                .maybeSingle();
              if (!msg) {
                await supabaseAdmin.from("twenty_sync_queue").update({
                  status: "failed", attempts: (it.attempts ?? 0) + 1, last_error: "message not found",
                }).eq("id", it.id);
                failed++;
                continue;
              }
              const personId = await ensureTwentyPerson(conn, msg.contact_phone);
              if (!personId) {
                await supabaseAdmin.from("twenty_sync_queue").update({
                  status: (it.attempts ?? 0) >= 5 ? "failed" : "pending",
                  attempts: (it.attempts ?? 0) + 1,
                  last_error: "could not create/find person",
                }).eq("id", it.id);
                failed++;
                continue;
              }
              const body = msg.text || msg.caption || (msg.media_type ? `[${msg.media_type}]` : "[mensagem vazia]");
              const arrow = msg.direction === "outbound" ? "→" : "←";
              const title = `${arrow} WhatsApp ${new Date(msg.created_at).toLocaleString("pt-BR")}`;
              const ok = await postTwentyNote(conn, personId, title, body);
              if (ok) {
                await supabaseAdmin.from("twenty_sync_queue").update({ status: "done" }).eq("id", it.id);
                done++;
              } else {
                await supabaseAdmin.from("twenty_sync_queue").update({
                  status: (it.attempts ?? 0) >= 5 ? "failed" : "pending",
                  attempts: (it.attempts ?? 0) + 1,
                  last_error: "twenty note POST failed",
                }).eq("id", it.id);
                failed++;
              }
            } catch (e) {
              await supabaseAdmin.from("twenty_sync_queue").update({
                status: (it.attempts ?? 0) >= 5 ? "failed" : "pending",
                attempts: (it.attempts ?? 0) + 1,
                last_error: e instanceof Error ? e.message : String(e),
              }).eq("id", it.id);
              failed++;
            }
          }
        }

        return Response.json({ ok: true, processed: items?.length ?? 0, done, failed });
      },
    },
  },
});
