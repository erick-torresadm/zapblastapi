// Recebe evento client-side e reenvia via CAPI server-side (deduplicação via event_id).
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/traffic-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
        const slug = String(body.slug ?? "").toLowerCase();
        const event_name = String(body.event_name ?? "");
        if (!slug || !event_name) return new Response("missing slug/event_name", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // pega settings (incluindo capi_token) — admin client bypassa RLS
        const { data: funnel } = await supabaseAdmin
          .from("traffic_funnels")
          .select("id, owner_user_id, settings")
          .eq("slug", slug)
          .eq("status", "published")
          .maybeSingle();
        if (!funnel) return new Response("not found", { status: 404 });

        const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
        const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null;

        // grava o evento via RPC pública (anônima)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabaseAdmin.rpc("log_traffic_event", {
          _slug: slug,
          _event_name: event_name,
          _event_id: (body.event_id as string) ?? null,
          _anonymous_id: (body.anonymous_id as string) ?? null,
          _fbp: (body.fbp as string) ?? null,
          _fbc: (body.fbc as string) ?? null,
          _ip_hash: ipHash,
          _ua: (body.ua as string) ?? null,
          _referrer: (body.referrer as string) ?? null,
          _page_url: (body.page_url as string) ?? null,
          _utm: (body.utm as Record<string, string>) ?? null,
          _payload: (body.payload as Record<string, unknown>) ?? {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        // Facebook CAPI (se configurado)
        const settings = (funnel.settings ?? {}) as { pixel_id?: string; capi_token?: string };
        if (settings.pixel_id && settings.capi_token) {
          try {
            const payload = {
              data: [{
                event_name,
                event_time: Math.floor(Date.now() / 1000),
                event_id: body.event_id ?? undefined,
                event_source_url: body.page_url ?? undefined,
                action_source: "website",
                user_data: {
                  client_ip_address: ip ?? undefined,
                  client_user_agent: body.ua ?? undefined,
                  fbp: body.fbp ?? undefined,
                  fbc: body.fbc ?? undefined,
                },
                custom_data: body.payload ?? {},
              }],
            };
            await fetch(
              `https://graph.facebook.com/v20.0/${settings.pixel_id}/events?access_token=${encodeURIComponent(settings.capi_token)}`,
              { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
            );
          } catch (e) {
            console.error("[CAPI] error", (e as Error).message);
          }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
