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
    const q = data.q.trim();
    const isEmail = q.includes("@");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    type Row = { id: string; full_name: string | null; email: string | null };
    const found = new Map<string, Row>();

    // 1) Search profiles by full_name
    if (!isEmail) {
      const { data: rows, error } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .ilike("full_name", `%${q}%`)
        .limit(20);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        found.set((r as any).id, { id: (r as any).id, full_name: (r as any).full_name, email: null });
      }
    }

    // 2) Search auth.users by email (admin API). Use a generous page size and filter client-side.
    try {
      const { data: list, error: lErr } = await (supabaseAdmin.auth.admin as any).listUsers({
        page: 1,
        perPage: 200,
      });
      if (lErr) throw lErr;
      const ql = q.toLowerCase();
      for (const u of list?.users ?? []) {
        const email = (u.email ?? "").toLowerCase();
        if (!email) continue;
        if (email.includes(ql)) {
          const existing = found.get(u.id);
          if (existing) {
            existing.email = u.email ?? null;
          } else {
            found.set(u.id, { id: u.id, full_name: null, email: u.email ?? null });
          }
        }
      }
    } catch (e) {
      console.warn("[adminSearchUsersFn] auth.listUsers failed:", (e as Error).message);
    }

    // 3) Hydrate names for users found by email but missing profile name
    const idsNeedingName = Array.from(found.values()).filter((r) => !r.full_name).map((r) => r.id);
    if (idsNeedingName.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", idsNeedingName);
      for (const p of profs ?? []) {
        const row = found.get((p as any).id);
        if (row) row.full_name = (p as any).full_name ?? row.full_name;
      }
    }

    // 4) Hydrate emails for users found by name
    const idsNeedingEmail = Array.from(found.values()).filter((r) => !r.email).map((r) => r.id);
    if (idsNeedingEmail.length > 0) {
      await Promise.all(
        idsNeedingEmail.map(async (id) => {
          try {
            const { data: u } = await (supabaseAdmin.auth.admin as any).getUserById(id);
            const row = found.get(id);
            if (row && u?.user?.email) row.email = u.user.email;
          } catch {
            // ignored
          }
        }),
      );
    }

    return Array.from(found.values()).slice(0, 30);
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

// ===== Plans CRUD (admin) =====

const planSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "slug: somente minúsculas, números e -"),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().default(""),
  price_cents: z.number().int().min(0),
  price_annual_cents: z.number().int().min(0).nullable().optional(),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  visible_public: z.boolean().default(true),
  sort_order: z.number().int().default(100),
  max_chips: z.number().int(),
  max_messages_per_day: z.number().int(),
  max_active_campaigns: z.number().int(),
  max_contacts_per_list: z.number().int(),
  max_crm_agents: z.number().int(),
  max_contact_lists: z.number().int(),
  max_flows: z.number().int(),
  max_traffic_funnels: z.number().int(),
  max_agenda_businesses: z.number().int(),
  max_group_campaigns: z.number().int(),
  monthly_free_maps_searches: z.number().int().min(0),
  warmup_tier: z.enum(["off", "basic", "advanced"]),
  has_agenda: z.boolean().default(true),
  feature_flags: z.record(z.string(), z.boolean()).default({}),
});

export const adminListPlansFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { id, ...rest } = data;
    let result;
    if (id) {
      const { data: row, error } = await context.supabase
        .from("subscription_plans")
        .update(rest as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = row;
      await context.supabase.rpc("log_admin_action", {
        _actor: context.userId,
        _action: "plan_updated",
        _target_type: "subscription_plan",
        _target_id: id,
        _payload: { slug: rest.slug, name: rest.name } as never,
        _ip: null,
        _user_agent: null,
      } as never);
    } else {
      const { data: row, error } = await context.supabase
        .from("subscription_plans")
        .insert(rest as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = row;
      await context.supabase.rpc("log_admin_action", {
        _actor: context.userId,
        _action: "plan_created",
        _target_type: "subscription_plan",
        _target_id: (row as { id: string }).id,
        _payload: { slug: rest.slug, name: rest.name } as never,
        _ip: null,
        _user_agent: null,
      } as never);
    }
    return result;
  });

export const adminDeletePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { count, error: cErr } = await context.supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(`Plano em uso por ${count} assinatura(s). Desative em vez de excluir.`);
    }
    const { error } = await context.supabase.from("subscription_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.rpc("log_admin_action", {
      _actor: context.userId,
      _action: "plan_deleted",
      _target_type: "subscription_plan",
      _target_id: data.id,
      _payload: {} as never,
      _ip: null,
      _user_agent: null,
    } as never);
    return { ok: true };
  });
