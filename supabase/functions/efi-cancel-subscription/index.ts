// Cancela a assinatura recorrente do usuário na Efí
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiFetch } from "../_shared/efi.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("Unauthorized", { status: 401, headers: cors });
    const { data: userData } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!userData.user) return new Response("Unauthorized", { status: 401, headers: cors });

    // Body opcional com reason/feedback (retention)
    let body: { reason?: string; feedback?: string } = {};
    try { body = await req.json(); } catch { /* sem body é ok */ }

    const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", userData.user.id).maybeSingle();
    if (!sub) {
      return new Response(JSON.stringify({ error: "Sem assinatura" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (sub.cancel_at_period_end) {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Cancela na Efí (impede próxima cobrança). Acesso continua até current_period_end.
    if (sub.efi_subscription_id) {
      const res = await efiFetch(`/v1/subscription/${sub.efi_subscription_id}/cancel`, { method: "PUT" });
      if (!res.ok) {
        const errBody = await res.json();
        return new Response(JSON.stringify({ error: "efi_error", details: errBody }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Marca cancelamento agendado para o fim do período já pago.
    // CDC: cliente já pagou pelo período corrente — mantém acesso, sem reembolso.
    await supabase.from("subscriptions").update({
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      cancellation_reason: body.reason ?? null,
      cancellation_feedback: body.feedback ?? null,
    }).eq("user_id", userData.user.id);

    return new Response(JSON.stringify({
      ok: true,
      access_until: sub.current_period_end,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("efi-cancel error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
