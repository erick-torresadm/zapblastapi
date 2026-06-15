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
