import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.any()).default({}),
}).passthrough();

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
}).passthrough();

const triggerConfigSchema = z.object({
  keywords: z.array(z.string()).optional(),
  match: z.enum(["any", "all", "exact"]).optional(),
  list_id: z.string().uuid().optional(),
}).partial();

/* ============================ LIST ============================ */
export const listFlowsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: flows, error } = await supabase
      .from("flows" as any)
      .select("id,name,description,status,trigger_type,instance_id,current_version_id,updated_at,created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Stats últimos 7 dias por flow
    const ids = (flows ?? []).map((f: any) => f.id);
    let stats: Record<string, { total: number; done: number; running: number; failed: number }> = {};
    if (ids.length) {
      const { data: runs } = await supabase
        .from("flow_runs" as any)
        .select("flow_id,status")
        .in("flow_id", ids)
        .gte("started_at", new Date(Date.now() - 7 * 86400000).toISOString());
      (runs ?? []).forEach((r: any) => {
        const s = stats[r.flow_id] ??= { total: 0, done: 0, running: 0, failed: 0 };
        s.total++;
        if (r.status === "done") s.done++;
        else if (r.status === "running" || r.status === "waiting") s.running++;
        else if (r.status === "failed") s.failed++;
      });
    }

    return (flows ?? []).map((f: any) => ({ ...f, stats: stats[f.id] ?? { total: 0, done: 0, running: 0, failed: 0 } }));
  });

/* ============================ GET ============================ */
export const getFlowFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: flow, error } = await supabase
      .from("flows" as any)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !flow) throw new Error("Fluxo não encontrado");

    let publishedNodes: any[] = [];
    let publishedEdges: any[] = [];
    let publishedVersion: number | null = null;
    if ((flow as any).current_version_id) {
      const { data: v } = await supabase
        .from("flow_versions" as any)
        .select("nodes,edges,version,published_at")
        .eq("id", (flow as any).current_version_id)
        .maybeSingle();
      if (v) { publishedNodes = (v as any).nodes; publishedEdges = (v as any).edges; publishedVersion = (v as any).version; }
    }

    return { flow, publishedNodes, publishedEdges, publishedVersion };
  });

/* ============================ CREATE ============================ */
export const createFlowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name?: string; template?: { nodes: any[]; edges: any[] } }) =>
    z.object({
      name: z.string().min(1).max(120).optional(),
      template: z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) }).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const insert: any = {
      user_id: userId,
      name: data.name ?? "Novo fluxo",
      draft_nodes: data.template?.nodes ?? [
        { id: "start", type: "start", position: { x: 240, y: 40 }, data: { label: "Início do fluxo" } },
      ],
      draft_edges: data.template?.edges ?? [],
    };
    const { data: row, error } = await supabase.from("flows" as any).insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

/* ============================ SAVE DRAFT ============================ */
export const saveFlowDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name?: string; description?: string; nodes: any[]; edges: any[]; trigger_type?: string; trigger_config?: any; instance_id?: string | null }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).optional(),
      nodes: z.array(nodeSchema),
      edges: z.array(edgeSchema),
      trigger_type: z.enum(["manual","keyword","new_contact","list_added","api"]).optional(),
      trigger_config: triggerConfigSchema.optional(),
      instance_id: z.string().uuid().nullable().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = { draft_nodes: data.nodes, draft_edges: data.edges };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.trigger_type !== undefined) patch.trigger_type = data.trigger_type;
    if (data.trigger_config !== undefined) patch.trigger_config = data.trigger_config;
    if (data.instance_id !== undefined) patch.instance_id = data.instance_id;
    const { error } = await supabase.from("flows" as any).update(patch).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, saved_at: new Date().toISOString() };
  });

/* ============================ PUBLISH ============================ */
export const publishFlowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: flow } = await supabase.from("flows" as any).select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");
    const f = flow as any;

    // Validações mínimas
    if (!f.draft_nodes?.length) throw new Error("Adicione ao menos um passo");
    if (!f.instance_id) throw new Error("Selecione um chip antes de publicar");
    if (f.trigger_type === "keyword" && !(f.trigger_config?.keywords?.length)) throw new Error("Defina pelo menos uma palavra-chave");

    const { data: maxV } = await supabase
      .from("flow_versions" as any)
      .select("version")
      .eq("flow_id", data.id)
      .order("version", { ascending: false })
      .limit(1);
    const nextV = ((maxV?.[0] as any)?.version ?? 0) + 1;

    const { data: newV, error: ve } = await supabase
      .from("flow_versions" as any)
      .insert({ flow_id: data.id, user_id: userId, version: nextV, nodes: f.draft_nodes, edges: f.draft_edges })
      .select("id,version,published_at")
      .single();
    if (ve) throw new Error(ve.message);

    const { error: ue } = await supabase
      .from("flows" as any)
      .update({ current_version_id: (newV as any).id, status: "active" })
      .eq("id", data.id);
    if (ue) throw new Error(ue.message);

    return { version: nextV, version_id: (newV as any).id, published_at: (newV as any).published_at };
  });

/* ============================ DUPLICATE ============================ */
export const duplicateFlowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src } = await supabase.from("flows" as any).select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (!src) throw new Error("Fluxo não encontrado");
    const s = src as any;
    const { data: row, error } = await supabase.from("flows" as any).insert({
      user_id: userId,
      name: `${s.name} (cópia)`,
      description: s.description,
      trigger_type: s.trigger_type,
      trigger_config: s.trigger_config,
      instance_id: s.instance_id,
      draft_nodes: s.draft_nodes,
      draft_edges: s.draft_edges,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

/* ============================ TOGGLE / DELETE ============================ */
export const toggleFlowStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; status: "active" | "paused" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active","paused"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("flows" as any).update({ status: data.status }).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFlowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("flows" as any).delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ METRICS ============================ */
export const getFlowNodeStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { flow_id: string }) => z.object({ flow_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: steps } = await supabase
      .from("flow_run_steps" as any)
      .select("node_id,status,duration_ms")
      .eq("flow_id", data.flow_id)
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

    const map: Record<string, { entered: number; ok: number; error: number; avg_ms: number; _sum: number; _cnt: number }> = {};
    (steps ?? []).forEach((s: any) => {
      const m = map[s.node_id] ??= { entered: 0, ok: 0, error: 0, avg_ms: 0, _sum: 0, _cnt: 0 };
      m.entered++;
      if (s.status === "ok") m.ok++;
      else if (s.status === "error") m.error++;
      if (s.duration_ms != null) { m._sum += s.duration_ms; m._cnt++; }
    });
    Object.values(map).forEach((m) => { m.avg_ms = m._cnt ? Math.round(m._sum / m._cnt) : 0; });
    return map;
  });
