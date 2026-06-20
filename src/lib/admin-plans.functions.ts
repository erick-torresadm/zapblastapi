import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: requer admin");
}

const grantSchema = z.object({
  target_user: z.string().uuid(),
  plan_id: z.string().uuid(),
  duration_days: z.number().int().min(1).max(3650),
  amount_paid_cents: z.number().int().min(0),
  method: z.string().min(1).max(50),
  note: z.string().max(500).optional().default(""),
});

export const grantManualPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => grantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: result, error } = await context.supabase.rpc("grant_manual_plan", {
      _target_user: data.target_user,
      _plan_id: data.plan_id,
      _duration_days: data.duration_days,
      _amount_paid_cents: data.amount_paid_cents,
      _method: data.method,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; subscription_id: string };
  });

export const adminSearchUsersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: z.string().trim().min(2).max(100).parse(input.q) }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${data.q}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminListUserSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => ({ user_id: z.string().uuid().parse(input.user_id) }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("subscriptions")
      .select("*, plan:subscription_plans(name, slug)")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
