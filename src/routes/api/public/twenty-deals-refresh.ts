// Worker chamado por pg_cron a cada 5min: atualiza twenty_deals_cache.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twenty-deals-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || apikey !== expected) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadTwentyConn, twentyFetch } = await import("@/lib/twenty.server");

        const { data: conns } = await supabaseAdmin
          .from("twenty_connections")
          .select("user_id")
          .eq("enabled", true);

        let refreshed = 0;
        for (const c of conns ?? []) {
          const conn = await loadTwentyConn(c.user_id);
          if (!conn) continue;
          const r = await twentyFetch(conn, "/opportunities?limit=100&order_by=updatedAt[DescNullsLast]");
          if (!r.ok) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opps = ((r.data as any)?.data?.opportunities ?? []) as Array<any>;
          if (!opps.length) {
            await supabaseAdmin.from("twenty_deals_cache").delete().eq("user_id", c.user_id);
            continue;
          }
          const rows = opps.map((o) => ({
            user_id: c.user_id,
            twenty_id: o.id,
            name: o.name ?? null,
            amount_micros: o.amount?.amountMicros ?? null,
            currency: o.amount?.currencyCode ?? null,
            stage: o.stage ?? null,
            close_date: o.closeDate ?? null,
            updated_at: new Date().toISOString(),
          }));
          await supabaseAdmin.from("twenty_deals_cache").upsert(rows, { onConflict: "user_id,twenty_id" });
          // limpa ids que não vieram mais
          const ids = opps.map((o) => o.id);
          await supabaseAdmin.from("twenty_deals_cache").delete().eq("user_id", c.user_id).not("twenty_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
          refreshed++;
        }
        return Response.json({ ok: true, refreshed });
      },
    },
  },
});
