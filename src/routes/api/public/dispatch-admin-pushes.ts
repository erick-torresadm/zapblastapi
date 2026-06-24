import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush, type PushSubscriptionRow } from "@/lib/vapid.server";

// Endpoint público chamado pelo pg_cron a cada minuto.
// Envia notificações push para todos os eventos admin pendentes.
export const Route = createFileRoute("/api/public/dispatch-admin-pushes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.CRON_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: events, error: evErr } = await supabaseAdmin
          .from("admin_push_events")
          .select("id, type, title, body, url")
          .is("pushed_at", null)
          .order("created_at", { ascending: true })
          .limit(50);
        if (evErr) return Response.json({ error: evErr.message }, { status: 500 });
        if (!events || events.length === 0) return Response.json({ ok: true, sent: 0 });

        // Busca todas as inscrições push de admins
        const { data: adminRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = (adminRoles ?? []).map((r) => r.user_id);
        if (adminIds.length === 0) {
          await supabaseAdmin
            .from("admin_push_events")
            .update({ pushed_at: new Date().toISOString() })
            .in("id", events.map((e) => e.id));
          return Response.json({ ok: true, sent: 0, reason: "no_admins" });
        }

        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth, user_id")
          .in("user_id", adminIds);
        const subscriptions = (subs ?? []) as Array<PushSubscriptionRow & { id: string; user_id: string }>;

        let sent = 0;
        const expired: string[] = [];
        for (const event of events) {
          for (const sub of subscriptions) {
            try {
              await sendWebPush(sub, {
                title: event.title,
                body: event.body,
                url: event.url ?? "/app/admin/notifications",
                tag: event.type,
              });
              sent++;
            } catch (e: unknown) {
              const err = e as { statusCode?: number };
              if (err.statusCode === 404 || err.statusCode === 410) expired.push(sub.endpoint);
            }
          }
        }

        if (expired.length > 0) {
          await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", expired);
        }
        await supabaseAdmin
          .from("admin_push_events")
          .update({ pushed_at: new Date().toISOString() })
          .in("id", events.map((e) => e.id));

        return Response.json({ ok: true, sent, events: events.length, expired: expired.length });
      },
      GET: async () => Response.json({ ok: true, info: "POST to dispatch" }),
    },
  },
});
