// Webhook Efí — recebe notificações de cobranças/assinaturas
// A Efí envia POST { notification: "<token>" }; fazemos GET /v1/notification/<token> pra obter os eventos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiFetch } from "../_shared/efi.ts";

Deno.serve(async (req) => {
  try {
    // Para validação inicial do webhook a Efí pode fazer POST com body vazio — responder 200.
    let payload: { notification?: string } = {};
    try { payload = await req.json(); } catch { /* body pode vir vazio */ }

    if (!payload.notification) {
      return new Response("ok", { status: 200 });
    }

    const res = await efiFetch(`/v1/notification/${payload.notification}`, { method: "GET" });
    const body = await res.json();
    const events = body?.data ?? [];

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pega o evento mais recente
    const latest = Array.isArray(events) ? events[events.length - 1] : null;
    if (!latest) return new Response("ok", { status: 200 });

    const subscriptionId = latest.subscription_id ?? latest.identifiers?.subscription_id;
    const status = latest.status?.current ?? latest.status;
    if (!subscriptionId) return new Response("ok", { status: 200 });

    let newStatus: string | null = null;
    if (status === "paid" || status === "active") newStatus = "active";
    else if (status === "unpaid" || status === "refunded") newStatus = "past_due";
    else if (status === "canceled") newStatus = "canceled";

    if (newStatus) {
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") {
        const next = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        patch.current_period_end = next;
        patch.next_charge_at = next;
      }
      await supabase.from("subscriptions").update(patch).eq("efi_subscription_id", subscriptionId);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("efi-webhook error", e);
    // Sempre 200 pra Efí não reentregar em loop por erro nosso
    return new Response("ok", { status: 200 });
  }
});
