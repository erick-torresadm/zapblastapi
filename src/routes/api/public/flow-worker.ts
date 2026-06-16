// Worker que avança flow_runs prontos. Chamado por pg_cron a cada minuto.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/flow-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { advanceFlowRun } = await import("@/lib/flow-engine.server");

        // 1) Promove runs em 'waiting' cujo wait_until já passou
        await supabaseAdmin.from("flow_runs")
          .update({ status: "pending", wait_until: null })
          .eq("status", "waiting")
          .is("waiting_for", null)
          .lte("wait_until", new Date().toISOString());

        // 2) Pega lote de runs pending
        const { data: runs } = await supabaseAdmin.from("flow_runs")
          .select("id")
          .eq("status", "pending")
          .order("updated_at", { ascending: true })
          .limit(50);

        let processed = 0;
        for (const r of runs ?? []) {
          // Avança até 10 nodes por run em uma execução (para fluir nodes "rápidos" como start/condition/tag)
          for (let i = 0; i < 10; i++) {
            const { data: cur } = await supabaseAdmin.from("flow_runs").select("status").eq("id", r.id).maybeSingle();
            if (!cur || cur.status !== "pending") break;
            await advanceFlowRun(supabaseAdmin, r.id);
          }
          processed++;
        }

        return Response.json({ processed });
      },
    },
  },
});
