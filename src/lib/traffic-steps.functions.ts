// CRUD de steps (páginas), blocks (por step) e logic (branching).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertOwner(supabase: any, funnel_id: string, userId: string) {
  const { data: f } = await supabase
    .from("traffic_funnels").select("id").eq("id", funnel_id)
    .eq("owner_user_id", userId).maybeSingle();
  if (!f) throw new Error("Funil não encontrado");
}

// ===== Steps =====
export const createStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnel_id: string; name?: string; type?: string; position?: number }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    name: i.name?.slice(0, 80) ?? "Nova página",
    type: i.type ?? "question",
    position: typeof i.position === "number" ? i.position : 999,
  }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.funnel_id, context.userId);
    const { data: s, error } = await context.supabase
      .from("traffic_steps")
      .insert({ funnel_id: data.funnel_id, name: data.name, type: data.type, position: data.position })
      .select().single();
    if (error) throw new Error(error.message);
    return s;
  });

export const updateStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name?: string; type?: string; settings?: Record<string, unknown>; next_step_id?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: s, error } = await context.supabase
      .from("traffic_steps").update(patch as any).eq("id", uuid.parse(id))
      .select().single();
    if (error) throw new Error(error.message);
    return s;
  });

export const deleteStepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: uuid.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("traffic_steps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderStepsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnel_id: string; step_ids: string[] }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    step_ids: z.array(uuid).parse(i.step_ids),
  }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.funnel_id, context.userId);
    for (let i = 0; i < data.step_ids.length; i++) {
      await context.supabase.from("traffic_steps").update({ position: i }).eq("id", data.step_ids[i]);
    }
    return { ok: true };
  });

// ===== Blocks por step =====
export const saveStepBlocksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    funnel_id: string;
    step_id: string;
    blocks: Array<{ id?: string; type: string; position: number; props: Record<string, unknown>; field_key?: string | null }>;
  }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    step_id: uuid.parse(i.step_id),
    blocks: i.blocks,
  }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.funnel_id, context.userId);
    await context.supabase.from("traffic_blocks").delete().eq("step_id", data.step_id);
    if (data.blocks.length > 0) {
      const rows = data.blocks.map((b, i) => ({
        funnel_id: data.funnel_id,
        step_id: data.step_id,
        type: b.type,
        position: i,
        props: b.props,
        field_key: b.field_key ?? null,
      }));
      const { error } = await context.supabase.from("traffic_blocks").insert(rows as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ===== Logic =====
export const saveLogicFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    funnel_id: string;
    step_id: string;
    rules: Array<{ block_id?: string | null; condition: Record<string, unknown>; next_step_id?: string | null; redirect_url?: string | null }>;
  }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    step_id: uuid.parse(i.step_id),
    rules: i.rules,
  }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.funnel_id, context.userId);
    await context.supabase.from("traffic_logic").delete().eq("step_id", data.step_id);
    if (data.rules.length > 0) {
      const rows = data.rules.map((r, i) => ({
        funnel_id: data.funnel_id,
        step_id: data.step_id,
        block_id: r.block_id ?? null,
        condition: r.condition,
        next_step_id: r.next_step_id ?? null,
        redirect_url: r.redirect_url ?? null,
        position: i,
      }));
      const { error } = await context.supabase.from("traffic_logic").insert(rows as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
