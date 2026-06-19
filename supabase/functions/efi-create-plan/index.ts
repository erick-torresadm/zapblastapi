// Cria um Plano recorrente na Efí (intervalo 1 mês, repetições infinitas)
// Body: { plan_id: uuid }  -> usa subscription_plans.name como nome do plano na Efí
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
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return new Response("Forbidden", { status: 403, headers: cors });

    const { plan_id } = await req.json();
    const { data: plan, error } = await supabase.from("subscription_plans").select("*").eq("id", plan_id).single();
    if (error || !plan) throw new Error("Plano não encontrado");

    // POST /v1/plan { name, interval, repeats }
    const res = await efiFetch("/v1/plan", {
      method: "POST",
      body: JSON.stringify({
        name: `${plan.name} (mensal)`,
        interval: 1,      // 1 mês
        repeats: null,    // infinito
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "efi_error", details: body }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const efiPlanId = body.data?.plan_id ?? body.plan_id;
    const env = efiEnv();
    const col = env === "prod" ? "efi_plan_id_prod" : "efi_plan_id_sandbox";
    await supabase.from("subscription_plans").update({ [col]: efiPlanId }).eq("id", plan_id);

    return new Response(JSON.stringify({ ok: true, efi_plan_id: efiPlanId, env }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("efi-create-plan error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
