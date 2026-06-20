import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const codeSchema = z.string().trim().min(2).max(50);

export const validateCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; plan_id?: string | null }) => ({
    code: codeSchema.parse(input.code),
    plan_id: input.plan_id ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("validate_coupon", {
      _code: data.code,
      _plan_id: data.plan_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as {
      valid: boolean;
      message: string;
      coupon_id?: string;
      type?: "percent" | "fixed" | "free";
      value?: number;
      free_duration_days?: number | null;
      base_cents?: number;
      discount_cents?: number;
      final_cents?: number;
    };
  });

export const applyFreeCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; plan_id: string }) => ({
    code: codeSchema.parse(input.code),
    plan_id: z.string().uuid().parse(input.plan_id),
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("apply_free_coupon", {
      _code: data.code,
      _plan_id: data.plan_id,
    });
    if (error) throw new Error(error.message);
    return result as { valid: boolean; redeemed?: boolean; subscription_id?: string; duration_days?: number; message?: string };
  });

export const redeemCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; plan_id: string; subscription_id?: string | null; payment_intent_id?: string | null }) => ({
    code: codeSchema.parse(input.code),
    plan_id: z.string().uuid().parse(input.plan_id),
    subscription_id: input.subscription_id ?? null,
    payment_intent_id: input.payment_intent_id ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("redeem_coupon", {
      _code: data.code,
      _plan_id: data.plan_id,
      _subscription_id: data.subscription_id ?? undefined,
      _payment_intent_id: data.payment_intent_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as { valid: boolean; redeemed?: boolean; message?: string };
  });

// ============== ADMIN ==============

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: requer admin");
}

const couponInputSchema = z.object({
  code: z.string().trim().min(2).max(50),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(["percent", "fixed", "free"]),
  value: z.number().min(0).max(100_000_000),
  plan_id: z.string().uuid().optional().nullable(),
  free_duration_days: z.number().int().min(1).max(3650).optional().nullable(),
  tool_scope: z.string().max(50).optional().nullable(),
  tool_free_uses: z.number().int().min(0).max(10000).optional().default(0),
  expires_at: z.string().datetime().optional().nullable(),
  max_redemptions: z.number().int().min(1).optional().nullable(),
  max_per_user: z.number().int().min(1).default(1),
  active: z.boolean().default(true),
});

export const adminListCouponsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("coupons")
      .select("*, plan:subscription_plans(id, name, slug)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminCreateCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => couponInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = { ...data, code: data.code.toUpperCase(), created_by: context.userId };
    const { data: row, error } = await context.supabase.from("coupons").insert(payload).select().single();
    if (error) throw new Error(error.message);
    await context.supabase.rpc("log_admin_action", {
      _actor: context.userId, _action: "coupon_create", _target_type: "coupon",
      _target_id: row.id, _payload: payload, _ip: "", _user_agent: "",
    });
    return row;
  });

export const adminUpdateCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: Partial<z.infer<typeof couponInputSchema>> }) => ({
    id: z.string().uuid().parse(input.id),
    patch: input.patch,
  }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const patch: any = { ...data.patch };
    if (patch.code) patch.code = String(patch.code).toUpperCase();
    const { data: row, error } = await context.supabase
      .from("coupons").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    await context.supabase.rpc("log_admin_action", {
      _actor: context.userId, _action: "coupon_update", _target_type: "coupon",
      _target_id: data.id, _payload: patch, _ip: "", _user_agent: "",
    });
    return row;
  });

export const adminDeleteCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.rpc("log_admin_action", {
      _actor: context.userId, _action: "coupon_delete", _target_type: "coupon",
      _target_id: data.id, _payload: {}, _ip: "", _user_agent: "",
    });
    return { ok: true };
  });

export const adminListRedemptionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { coupon_id?: string }) => ({ coupon_id: input?.coupon_id ?? null }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("coupon_redemptions")
      .select("*, coupon:coupons(code, type), plan:subscription_plans(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.coupon_id) q = q.eq("coupon_id", data.coupon_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminListPlansFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("subscription_plans")
      .select("id, name, slug, price_cents")
      .order("price_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
