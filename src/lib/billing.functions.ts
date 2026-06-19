import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBillingStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [plansRes, subRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("active", true).order("sort_order"),
      supabase.from("subscriptions").select("*, subscription_plans(*)").eq("user_id", userId).maybeSingle(),
    ]);
    return { plans: plansRes.data ?? [], subscription: subRes.data ?? null };
  });

// Expõe a config pública da Efí (Payee Code + env) pro frontend tokenizar cartão
export const getEfiPublicConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const env = (process.env.EFI_ENV ?? "sandbox") as "prod" | "sandbox";
  const payeeCode =
    env === "prod"
      ? process.env.EFI_PAYEE_CODE_PROD
      : process.env.EFI_PAYEE_CODE_SANDBOX;
  if (!payeeCode) throw new Error("Payee code não configurado para o ambiente " + env);
  return { env, payeeCode };
});
