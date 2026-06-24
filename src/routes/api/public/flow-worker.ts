// Worker que avança flow_runs prontos. Chamado por pg_cron a cada minuto.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/flow-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.CRON_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { advanceFlowRun } = await import("@/lib/flow-engine.server");

        // 1) Pega lote de runs prontos: pending ou waiting com wait_until vencido.
        const { data: pendingRuns } = await supabaseAdmin.from("flow_runs")
          .select("id")
          .eq("status", "pending")
          .order("updated_at", { ascending: true })
          .limit(25);
        const { data: waitingRuns } = await supabaseAdmin.from("flow_runs")
          .select("id")
          .eq("status", "waiting")
          .is("waiting_for", null)
          .lte("wait_until", new Date().toISOString())
          .order("wait_until", { ascending: true })
          .limit(25);
        const { data: safetyBlockedRows } = await supabaseAdmin.from("flow_run_steps")
          .select("run_id, output, flow_runs!inner(id, status, waiting_for)")
          .eq("status", "skipped")
          .in("output->>reason", ["anti-ban", "rate-limit"])
          .eq("flow_runs.status", "waiting")
          .is("flow_runs.waiting_for", null)
          .order("created_at", { ascending: false })
          .limit(25);
        const runs = [...(pendingRuns ?? []), ...(waitingRuns ?? []), ...((safetyBlockedRows ?? []).map((r: any) => ({ id: r.run_id })))];

        let processed = 0;
        const details: Array<{ id: string; before?: unknown; after?: unknown; iterations: number; error?: string }> = [];
        for (const r of runs ?? []) {
          // Avança até 10 nodes por run em uma execução (para fluir nodes "rápidos" como start/condition/tag)
          const item: { id: string; before?: unknown; after?: unknown; iterations: number; error?: string } = { id: r.id, iterations: 0 };
          const { data: before } = await supabaseAdmin.from("flow_runs").select("status, current_node_id, wait_until, waiting_for").eq("id", r.id).maybeSingle();
          item.before = before;
          for (let i = 0; i < 10; i++) {
            const { data: cur } = await supabaseAdmin.from("flow_runs").select("status, wait_until").eq("id", r.id).maybeSingle();
            if (!cur) break;
            const readyWaiting = cur.status === "waiting" && (!cur.wait_until || new Date(cur.wait_until).getTime() <= Date.now());
            if (cur.status !== "pending" && !readyWaiting) break;
            try {
              await advanceFlowRun(supabaseAdmin, r.id);
              item.iterations++;
            } catch (e) {
              item.error = (e as Error).message;
              console.error("[flow-worker] advance failed", { runId: r.id, error: item.error });
              break;
            }
          }
          const { data: after } = await supabaseAdmin.from("flow_runs").select("status, current_node_id, wait_until, waiting_for, error").eq("id", r.id).maybeSingle();
          item.after = after;
          details.push(item);
          console.log("[flow-worker] processed run", item);
          processed++;
        }

        return Response.json({ processed, details });
      },
    },
  },
});
