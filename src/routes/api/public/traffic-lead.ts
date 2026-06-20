// Recebe submissão de formulário de lead e empurra para a lista CRM configurada.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/traffic-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
        const slug = String(body.slug ?? "").toLowerCase();
        if (!slug) return new Response("missing slug", { status: 400 });

        const name = (body.name as string) || null;
        const phone = (body.phone as string) || null;
        const email = (body.email as string) || null;

        if (!phone && !email) return new Response("phone ou email obrigatório", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabaseAdmin.rpc as any)("submit_traffic_lead", {
          _slug: slug,
          _name: name,
          _phone: phone,
          _email: email,
          _extra: (body.extra as Record<string, unknown>) ?? {},
          _utm: (body.utm as Record<string, string>) ?? null,
        });
        if (error) return new Response(error.message, { status: 400 });
        return new Response(JSON.stringify({ ok: true, id: data }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
