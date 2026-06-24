// Recebe eventos do Chatwoot e empurra outbound do agente pro WhatsApp via Evolution.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chatwoot-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        if (!secret) return new Response("missing secret", { status: 401 });

        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body) return new Response("invalid body", { status: 400 });

        // só nos interessa message_created outgoing
        const event = body.event as string | undefined;
        const messageType = body.message_type as string | undefined;
        if (event !== "message_created" || messageType !== "outgoing") {
          return new Response(JSON.stringify({ ignored: true }), { headers: { "Content-Type": "application/json" } });
        }

        // evita eco: se source_id começa com perseidas: foi enviado por nós
        const sourceId = body.source_id as string | undefined;
        if (sourceId?.startsWith("perseidas:")) {
          return new Response(JSON.stringify({ ignored: "echo" }), { headers: { "Content-Type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accountId = (body.account as any)?.id as number | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inboxId = (body.inbox as any)?.id as number | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conversation = body.conversation as any;
        const content = body.content as string | undefined;
        if (!accountId || !inboxId || !conversation || !content?.trim()) {
          return new Response(JSON.stringify({ ignored: "incomplete" }), { headers: { "Content-Type": "application/json" } });
        }

        // valida secret olhando connection
        const { data: conn } = await supabaseAdmin
          .from("chatwoot_connections")
          .select("user_id, webhook_secret")
          .eq("chatwoot_account_id", accountId)
          .maybeSingle();
        if (!conn || conn.webhook_secret !== secret) {
          return new Response("invalid secret", { status: 401 });
        }

        // resolve instance via inbox map
        const { data: inboxMap } = await supabaseAdmin
          .from("chatwoot_inbox_map")
          .select("instance_id")
          .eq("user_id", conn.user_id)
          .eq("chatwoot_inbox_id", inboxId)
          .maybeSingle();
        if (!inboxMap) return new Response("inbox not mapped", { status: 404 });

        // resolve phone do contato
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phone = (conversation?.meta?.sender?.phone_number as string | undefined)?.replace(/^\+/, "")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ?? (conversation?.meta?.sender?.identifier as string | undefined)?.replace(/^\+/, "");
        if (!phone) return new Response("no phone", { status: 422 });

        // pega instance pra Evolution
        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, evolution_server_id")
          .eq("id", inboxMap.instance_id)
          .maybeSingle();
        if (!inst) return new Response("instance not found", { status: 404 });

        const { data: server } = await supabaseAdmin
          .from("evolution_servers")
          .select("base_url, api_key")
          .eq("id", inst.evolution_server_id)
          .maybeSingle();
        if (!server) return new Response("server not found", { status: 404 });

        // envia via Evolution
        const evoRes = await fetch(`${server.base_url.replace(/\/+$/, "")}/message/sendText/${inst.instance_name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: server.api_key,
          },
          body: JSON.stringify({ number: phone, text: content }),
          signal: AbortSignal.timeout(15_000),
        }).catch((e) => ({ ok: false, status: 0, _err: e } as unknown as Response));

        if (!evoRes.ok) {
          return new Response(JSON.stringify({ ok: false, error: `evolution ${evoRes.status}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        // registra mensagem como saída marcando from_chatwoot pra trigger ignorar
        await supabaseAdmin.from("chat_messages").insert({
          user_id: conn.user_id,
          instance_id: inst.id,
          contact_phone: phone,
          direction: "out",
          text: content,
          message_type: "text",
          from_chatwoot: true,
        });

        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
