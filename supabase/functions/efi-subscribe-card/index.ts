// Cria assinatura no cartão (one-step) na Efí
// Body: {
//   plan_id: uuid,
//   payment_token: string,        // tokenizado no front via Efí JS
//   customer: { name, cpf, email, phone_number, birth },
//   billing_address: { street, number, neighborhood, zipcode, city, state }
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiFetch, efiEnv } from "../_shared/efi.ts";

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
    const userId = userData.user.id;

    const { plan_id, payment_token, customer, billing_address } = await req.json();
    if (!plan_id || !payment_token || !customer) {
      return new Response(JSON.stringify({ error: "Dados incompletos" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: plan, error } = await supabase.from("subscription_plans").select("*").eq("id", plan_id).single();
    if (error || !plan) throw new Error("Plano não encontrado");

    const env = efiEnv();
    const efiPlanId = env === "prod" ? plan.efi_plan_id_prod : plan.efi_plan_id_sandbox;
    if (!efiPlanId) throw new Error("Plano não cadastrado na Efí. Rode efi-create-plan primeiro.");

    // POST /v1/plan/:id/subscription/one-step
    const payload = {
      items: [{ name: plan.name, value: plan.price_cents, amount: 1 }],
      payment: {
        credit_card: {
          payment_token,
          billing_address,
          customer,
        },
      },
    };
    const res = await efiFetch(`/v1/plan/${efiPlanId}/subscription/one-step`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error("Efí subscribe error", body);
      return new Response(JSON.stringify({ error: "efi_error", details: body }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const subscriptionId: number = body.data?.subscription_id ?? body.subscription_id;
    const status: string = body.data?.status ?? body.status ?? "new";

    await supabase.from("subscriptions").upsert({
      user_id: userId,
      plan_id,
      status: status === "active" || status === "new" ? "active" : "past_due",
      efi_subscription_id: subscriptionId,
      payment_method: "card",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      next_charge_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      trial_ends_at: null,
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ ok: true, subscription_id: subscriptionId, status }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("efi-subscribe-card error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
