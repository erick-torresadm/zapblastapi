import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const matchModeSchema = z.enum(["exact", "contains", "starts_with"]);

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  flow_id: z.string().uuid(),
  instance_id: z.string().uuid().nullable().optional(),
  keywords: z.array(z.string().min(1)).min(1),
  match_mode: matchModeSchema.default("contains"),
  active: z.boolean().default(true),
  user_id: z.string().uuid().optional(), // admin pode definir para outro usuário
});

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

export const listKeywordTriggersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);

    const query = supabase
      .from("flow_keyword_triggers" as any)
      .select("id,user_id,flow_id,instance_id,keywords,match_mode,active,created_by_admin,created_at,updated_at")
      .order("created_at", { ascending: false });

    const { data, error } = admin ? await query : await query.eq("user_id", userId);
    if (error) throw new Error(error.message);

    // dados auxiliares
    const flowIds = Array.from(new Set((data ?? []).map((r: any) => r.flow_id)));
    const instIds = Array.from(new Set((data ?? []).map((r: any) => r.instance_id).filter(Boolean)));

    const [flows, instances] = await Promise.all([
      flowIds.length
        ? supabase.from("flows" as any).select("id,name").in("id", flowIds).then((r: any) => r.data ?? [])
        : Promise.resolve([]),
      instIds.length
        ? supabase.from("whatsapp_instances" as any).select("id,instance_name,status").in("id", instIds).then((r: any) => r.data ?? [])
        : Promise.resolve([]),
    ]);

    const flowMap = Object.fromEntries((flows as any[]).map((f) => [f.id, f.name]));
    const instMap = Object.fromEntries((instances as any[]).map((i) => [i.id, i]));

    return {
      isAdmin: admin,
      items: (data ?? []).map((r: any) => ({
        ...r,
        flow_name: flowMap[r.flow_id] ?? "—",
        instance: r.instance_id ? instMap[r.instance_id] ?? null : null,
      })),
    };
  });

export const upsertKeywordTriggerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    const targetUserId = admin && data.user_id ? data.user_id : userId;

    // valida flow pertence ao target
    const { data: flow } = await supabase
      .from("flows" as any).select("id").eq("id", data.flow_id).eq("user_id", targetUserId).maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");

    if (data.instance_id) {
      const { data: inst } = await supabase
        .from("whatsapp_instances" as any).select("id").eq("id", data.instance_id).eq("user_id", targetUserId).maybeSingle();
      if (!inst) throw new Error("Chip inválido");
    }

    const keywords = data.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

    if (data.id) {
      const { error } = await supabase.from("flow_keyword_triggers" as any).update({
        flow_id: data.flow_id,
        instance_id: data.instance_id ?? null,
        keywords,
        match_mode: data.match_mode,
        active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: ins, error } = await (supabase.from("flow_keyword_triggers" as any).insert({
      user_id: targetUserId,
      flow_id: data.flow_id,
      instance_id: data.instance_id ?? null,
      keywords,
      match_mode: data.match_mode,
      active: data.active,
      created_by_admin: admin && targetUserId !== userId,
    }).select("id").single() as any);
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as { id: string }).id };
  });

export const toggleKeywordTriggerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("flow_keyword_triggers" as any)
      .update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteKeywordTriggerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("flow_keyword_triggers" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFlowsForKeywordsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    const flowsQ = supabase.from("flows" as any).select("id,name,user_id").order("name");
    const { data: flows } = admin ? await flowsQ : await flowsQ.eq("user_id", userId);
    const instQ = supabase.from("whatsapp_instances" as any).select("id,instance_name,status,user_id").order("instance_name");
    const { data: instances } = admin ? await instQ : await instQ.eq("user_id", userId);
    let users: Array<{ id: string; email: string }> = [];
    if (admin) {
      const { data: profs } = await supabase.from("profiles" as any).select("id,full_name").limit(200);
      users = (profs ?? []).map((p: any) => ({ id: p.id, email: p.full_name ?? p.id }));
    }
    return { isAdmin: admin, flows: flows ?? [], instances: instances ?? [], users };
  });
