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

    let subscription = subRes.data;

    // Backfill: usuários criados antes do trigger ficam sem subscription.
    // Cria automaticamente o trial de 10 dias no Pro pra não deixar a tela vazia.
    if (!subscription) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const proPlan = (plansRes.data ?? []).find((p) => p.slug === "pro");
      if (proPlan) {
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
        await supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          plan_id: proPlan.id,
          status: "trialing",
          trial_ends_at: trialEnd.toISOString(),
          current_period_start: now.toISOString(),
          current_period_end: trialEnd.toISOString(),
        } as never);
        const refetch = await supabase.from("subscriptions").select("*, subscription_plans(*)").eq("user_id", userId).maybeSingle();
        subscription = refetch.data;
      }
    }

    return { plans: plansRes.data ?? [], subscription: subscription ?? null };
  });


export type PlanLimits = {
  has_subscription: boolean;
  status?: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  plan_slug?: string;
  plan_name?: string;
  trial_ends_at?: string | null;
  trial_expired?: boolean;
  can_act: boolean;
  limits?: {
    max_chips: number;
    max_messages_per_day: number;
    max_active_campaigns: number;
    max_contacts_per_list: number;
    max_crm_agents: number;
    warmup_tier: "off" | "basic" | "advanced";
  };
  usage?: {
    chips: number;
    active_campaigns: number;
    messages_today: number;
  };
};

export const getPlanLimitsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanLimits> => {
    const { supabase, userId } = context;
    // Expira trials vencidos antes de ler (best-effort)
    await supabase.rpc("expire_trials" as never).then(() => {}, () => {});
    const { data, error } = await supabase.rpc("get_user_plan_limits" as never, { _user_id: userId } as never);
    if (error) throw error;
    return (data as unknown as PlanLimits) ?? { has_subscription: false, can_act: false };
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
