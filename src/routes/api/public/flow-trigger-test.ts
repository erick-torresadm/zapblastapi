// Endpoint para testar manualmente um gatilho de palavra-chave.
// Simula uma mensagem recebida e dispara triggerKeywordFlows.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/flow-trigger-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = await request.json().catch(() => ({})) as {
          user_id?: string; phone?: string; text?: string; instance_id?: string | null; from_me?: boolean;
        };
        if (!body.user_id || !body.phone || !body.text) {
          return Response.json({ ok: false, error: "missing user_id, phone or text" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { triggerKeywordFlows, advanceFlowRun } = await import("@/lib/flow-engine.server");
        const phone = String(body.phone).replace(/[^0-9]/g, "");
        const result = await triggerKeywordFlows(supabaseAdmin, {
          user_id: body.user_id,
          instance_id: body.instance_id ?? null,
          phone,
          text: body.text,
          from_me: !!body.from_me,
        });
        // Avança imediatamente os runs criados (modo síncrono para o teste)
        for (const runId of result.runs) {
          for (let i = 0; i < 20; i++) {
            const { data: cur } = await supabaseAdmin.from("flow_runs").select("status").eq("id", runId).maybeSingle();
            if (!cur || cur.status !== "pending") break;
            await advanceFlowRun(supabaseAdmin, runId);
          }
        }
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
