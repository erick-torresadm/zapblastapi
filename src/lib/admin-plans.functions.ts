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
