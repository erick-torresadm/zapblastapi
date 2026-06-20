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
  allow_from_me: z.boolean().default(false),
  delay_seconds: z.number().int().min(0).max(86400).default(0),
  cooldown_seconds: z.number().int().min(0).max(86400).default(0),
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
      .select("id,user_id,flow_id,instance_id,keywords,match_mode,active,created_by_admin,allow_from_me,delay_seconds,cooldown_seconds,created_at,updated_at")
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
        ? supabase.from("whatsapp_instances" as any).select("id,instance_name,phone_number,status").in("id", instIds).then((r: any) => r.data ?? [])
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
        allow_from_me: data.allow_from_me,
        delay_seconds: data.delay_seconds,
        cooldown_seconds: data.cooldown_seconds,
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
      allow_from_me: data.allow_from_me,
      delay_seconds: data.delay_seconds,
      cooldown_seconds: data.cooldown_seconds,
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
    const instQ = supabase.from("whatsapp_instances" as any).select("id,instance_name,phone_number,status,user_id").order("instance_name");
    const { data: instances } = admin ? await instQ : await instQ.eq("user_id", userId);
    let users: Array<{ id: string; email: string }> = [];
    if (admin) {
      const { data: profs } = await supabase.from("profiles" as any).select("id,full_name").limit(200);
      users = (profs ?? []).map((p: any) => ({ id: p.id, email: p.full_name ?? p.id }));
    }
    return { isAdmin: admin, flows: flows ?? [], instances: instances ?? [], users };
  });

// Lista os últimos disparos do usuário (fila do painel Bot).
export const listRecentFlowRunsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    const q = supabase.from("flow_runs" as any)
      .select("id, flow_id, contact_phone, instance_id, status, error, started_at, finished_at, wait_until, variables")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const { data: runs, error } = admin ? await q : await q.eq("user_id", userId);
    if (error) throw new Error(error.message);

    const flowIds = Array.from(new Set((runs ?? []).map((r: any) => r.flow_id)));
    const instIds = Array.from(new Set((runs ?? []).map((r: any) => r.instance_id).filter(Boolean)));
    const [flows, instances] = await Promise.all([
      flowIds.length
        ? supabase.from("flows" as any).select("id,name").in("id", flowIds).then((r: any) => r.data ?? [])
        : Promise.resolve([]),
      instIds.length
        ? supabase.from("whatsapp_instances" as any).select("id,instance_name").in("id", instIds).then((r: any) => r.data ?? [])
        : Promise.resolve([]),
    ]);
    const flowMap = Object.fromEntries((flows as any[]).map((f) => [f.id, f.name]));
    const instMap = Object.fromEntries((instances as any[]).map((i) => [i.id, i.instance_name]));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = (runs ?? []).filter((r: any) => r.started_at && new Date(r.started_at) >= today).length;

    return {
      todayCount,
      items: (runs ?? []).map((r: any) => ({
        id: r.id,
        flow_name: flowMap[r.flow_id] ?? "—",
        instance_name: r.instance_id ? instMap[r.instance_id] ?? "—" : "—",
        contact_phone: r.contact_phone,
        status: r.status,
        error: r.error,
        started_at: r.started_at,
        finished_at: r.finished_at,
        wait_until: r.wait_until,
        keyword: (r.variables ?? {}).__trigger_keyword ?? null,
      })),
    };
  });

// Testa um gatilho disparando o fluxo manualmente. Usa o telefone do contato fornecido.
export const testKeywordTriggerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    trigger_id: z.string().uuid(),
    phone: z.string().min(8).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);

    const tQ = supabase.from("flow_keyword_triggers" as any)
      .select("user_id, keywords, instance_id")
      .eq("id", data.trigger_id);
    const { data: trigger } = admin ? await tQ.maybeSingle() : await tQ.eq("user_id", userId).maybeSingle();
    if (!trigger) throw new Error("Gatilho não encontrado");

    const tr = trigger as unknown as { user_id: string; keywords: string[]; instance_id: string | null };
    const sampleKeyword = (tr.keywords?.[0] ?? "teste").toString();
    const phone = data.phone.replace(/[^0-9]/g, "");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { triggerKeywordFlows, advanceFlowRun } = await import("@/lib/flow-engine.server");
    const result = await triggerKeywordFlows(supabaseAdmin, {
      user_id: tr.user_id,
      instance_id: tr.instance_id,
      phone,
      text: sampleKeyword,
      from_me: false,
    });
    for (const runId of result.runs) {
      const started = Date.now();
      for (let i = 0; i < 20; i++) {
        const { data: cur } = await supabaseAdmin.from("flow_runs").select("status, wait_until").eq("id", runId).maybeSingle();
        if (!cur) break;
        const state = cur as { status: string; wait_until: string | null };
        if (state.status === "waiting" && state.wait_until) {
          const waitMs = new Date(state.wait_until).getTime() - Date.now();
          if (waitMs > 0) {
            if (Date.now() - started + waitMs > 25_000) break;
            await new Promise((r) => setTimeout(r, waitMs + 50));
          }
        } else if (state.status !== "pending") break;
        await advanceFlowRun(supabaseAdmin, runId);
      }
    }
    return { ok: true, matched: result.matched, runs: result.runs };
  });

// Cancela uma execução individual de fluxo (qualquer estado não-final).
export const cancelFlowRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    const q = supabase.from("flow_runs" as any)
      .update({ status: "stopped", finished_at: new Date().toISOString(), wait_until: null, waiting_for: null, error: "Cancelado pelo usuário" })
      .in("status", ["pending", "waiting", "running"])
      .eq("id", data.id);
    const { error } = admin ? await q : await q.eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Cancela todas as execuções em andamento do usuário (ou todas, se admin).
export const cancelAllFlowRunsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    const q = supabase.from("flow_runs" as any)
      .update({ status: "stopped", finished_at: new Date().toISOString(), wait_until: null, waiting_for: null, error: "Cancelado em lote" })
      .in("status", ["pending", "waiting", "running"]);
    const { data, error } = admin ? await q.select("id") : await q.eq("user_id", userId).select("id");
    if (error) throw new Error(error.message);
    return { ok: true, canceled: (data ?? []).length };
  });

