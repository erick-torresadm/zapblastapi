// Motor de execução de fluxos. Server-only. Processa um node por vez e reagenda via wait_until.
import { sendText } from "@/lib/evolution.server";

type Node = { id: string; type: string; data?: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string };
type Flow = { nodes: Node[]; edges: Edge[] };

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function nextEdge(flow: Flow, nodeId: string, handle?: string): Edge | undefined {
  return flow.edges.find((e) => e.source === nodeId && (handle ? e.sourceHandle === handle : true))
    ?? flow.edges.find((e) => e.source === nodeId);
}

function findEntryNode(flow: Flow): Node | undefined {
  const start = flow.nodes.find((n) => n.type === "start");
  if (start) {
    const next = nextEdge(flow, start.id);
    return next ? flow.nodes.find((n) => n.id === next.target) : undefined;
  }
  // sem start explícito: pega node que não é alvo de nenhuma edge
  const targets = new Set(flow.edges.map((e) => e.target));
  return flow.nodes.find((n) => !targets.has(n.id) && n.type !== "start");
}

export async function loadFlow(supabaseAdmin: any, flowId: string): Promise<Flow | null> {
  const { data: flow } = await supabaseAdmin.from("flows").select("current_version_id, draft_nodes, draft_edges").eq("id", flowId).maybeSingle();
  if (!flow) return null;
  if (flow.current_version_id) {
    const { data: ver } = await supabaseAdmin.from("flow_versions").select("nodes, edges").eq("id", flow.current_version_id).maybeSingle();
    if (ver?.nodes?.length) return { nodes: ver.nodes as Node[], edges: (ver.edges ?? []) as Edge[] };
  }
  return { nodes: (flow.draft_nodes ?? []) as Node[], edges: (flow.draft_edges ?? []) as Edge[] };
}

export async function createFlowRun(
  supabaseAdmin: any,
  args: { flow_id: string; user_id: string; contact_id: string; contact_phone: string; instance_id: string; initial_vars?: Record<string, string> },
): Promise<string | null> {
  const flow = await loadFlow(supabaseAdmin, args.flow_id);
  if (!flow) return null;
  const entry = findEntryNode(flow);
  if (!entry) return null;
  const { data } = await supabaseAdmin.from("flow_runs").insert({
    flow_id: args.flow_id,
    user_id: args.user_id,
    contact_id: args.contact_id,
    contact_phone: args.contact_phone,
    instance_id: args.instance_id,
    status: "pending",
    current_node_id: entry.id,
    variables: args.initial_vars ?? {},
    started_at: new Date().toISOString(),
  }).select("id").single();
  return data?.id ?? null;
}

// Executa um único passo do run. Retorna true se ainda tem trabalho a fazer (status=pending).
export async function advanceFlowRun(supabaseAdmin: any, runId: string): Promise<void> {
  const { data: run } = await supabaseAdmin.from("flow_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.status === "completed" || run.status === "failed") return;

  const flow = await loadFlow(supabaseAdmin, run.flow_id);
  if (!flow) {
    await supabaseAdmin.from("flow_runs").update({ status: "failed", error: "Flow não encontrado", finished_at: new Date().toISOString() }).eq("id", runId);
    return;
  }

  const node = flow.nodes.find((n) => n.id === run.current_node_id);
  if (!node) {
    await supabaseAdmin.from("flow_runs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", runId);
    return;
  }

  // Carrega chip
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name, status, evolution_servers(base_url, api_key)")
    .eq("id", run.instance_id)
    .maybeSingle();
  const srv = inst?.evolution_servers as { base_url: string; api_key: string } | null;

  const vars = (run.variables ?? {}) as Record<string, string>;
  const data = (node.data ?? {}) as Record<string, unknown>;

  async function logStep(status: "completed" | "failed", error?: string, output?: Record<string, unknown>) {
    await supabaseAdmin.from("flow_run_steps").insert({
      run_id: runId, flow_id: run.flow_id, user_id: run.user_id,
      node_id: node!.id, node_type: node!.type, status, error: error ?? null, output: output ?? null,
    });
  }

  async function goNext(handle?: string) {
    const edge = nextEdge(flow!, node!.id, handle);
    if (!edge) {
      await supabaseAdmin.from("flow_runs").update({ status: "completed", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
    } else {
      await supabaseAdmin.from("flow_runs").update({
        current_node_id: edge.target, status: "pending", waiting_for: null, wait_until: null,
      }).eq("id", runId);
    }
  }

  try {
    if (node.type === "start") {
      await logStep("completed");
      await goNext();
      return;
    }

    if (node.type === "message") {
      const tpl = String(data.message ?? "");
      if (tpl && srv && inst?.status === "connected") {
        await sendText({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, run.contact_phone, renderTemplate(tpl, vars));
      }
      await logStep("completed", undefined, { sent: !!tpl });
      await goNext();
      return;
    }

    if (node.type === "ask") {
      const tpl = String(data.message ?? "");
      if (tpl && srv && inst?.status === "connected") {
        await sendText({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, run.contact_phone, renderTemplate(tpl, vars));
      }
      // pausa esperando resposta — webhook vai resumir
      await supabaseAdmin.from("flow_runs").update({
        status: "waiting", waiting_for: String(data.variable ?? "resposta"),
      }).eq("id", runId);
      await logStep("completed", undefined, { waiting_for: String(data.variable ?? "resposta") });
      return;
    }

    if (node.type === "delay") {
      const secs = Number(data.delaySeconds ?? 60);
      const until = new Date(Date.now() + secs * 1000).toISOString();
      await supabaseAdmin.from("flow_runs").update({ status: "waiting", wait_until: until }).eq("id", runId);
      await logStep("completed", undefined, { wait_until: until });
      return;
    }

    if (node.type === "condition") {
      const field = String(data.conditionField ?? "");
      const equals = String(data.conditionEquals ?? "");
      const op = String(data.conditionOp ?? "eq");
      const v = String(vars[field] ?? "");
      let yes = false;
      if (op === "eq") yes = v.toLowerCase() === equals.toLowerCase();
      else if (op === "lte") yes = Number(v) <= Number(equals);
      else if (op === "gte") yes = Number(v) >= Number(equals);
      else if (op === "contains") yes = v.toLowerCase().includes(equals.toLowerCase());
      await logStep("completed", undefined, { result: yes });
      await goNext(yes ? "yes" : "no");
      return;
    }

    if (node.type === "tag" || node.type === "ai") {
      // tag/ai: noop (sem sistema de tags / IA neste motor mínimo)
      await logStep("completed");
      await goNext();
      return;
    }

    if (node.type === "transfer_human") {
      await logStep("completed");
      await supabaseAdmin.from("flow_runs").update({ status: "completed", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
      return;
    }

    // tipo desconhecido — pula
    await logStep("completed");
    await goNext();
  } catch (e) {
    const msg = (e as Error).message;
    await logStep("failed", msg);
    await supabaseAdmin.from("flow_runs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
  }
}

// Resume runs aguardando resposta deste contato. Grava resposta no variable, avança.
export async function resumeFlowRunsForReply(
  supabaseAdmin: any,
  args: { user_id: string; phone: string; text: string | null },
): Promise<void> {
  const { data: runs } = await supabaseAdmin.from("flow_runs")
    .select("id, current_node_id, flow_id, waiting_for, variables")
    .eq("user_id", args.user_id)
    .eq("contact_phone", args.phone)
    .eq("status", "waiting")
    .not("waiting_for", "is", null);
  if (!runs?.length) return;
  for (const r of runs as Array<{ id: string; current_node_id: string; flow_id: string; waiting_for: string; variables: Record<string, string> }>) {
    const flow = await loadFlow(supabaseAdmin, r.flow_id);
    if (!flow) continue;
    const node = flow.nodes.find((n) => n.id === r.current_node_id);
    if (!node) continue;
    const newVars = { ...(r.variables ?? {}), [r.waiting_for]: args.text ?? "" };
    const edge = nextEdge(flow, node.id);
    await supabaseAdmin.from("flow_runs").update({
      variables: newVars,
      waiting_for: null,
      status: "pending",
      current_node_id: edge?.target ?? null,
      ...(edge ? {} : { finished_at: new Date().toISOString(), status: "completed" }),
    }).eq("id", r.id);
  }
}

// Verifica triggers por keyword e dispara o fluxo (chamado pelo webhook MESSAGES_UPSERT).
export async function triggerKeywordFlows(
  supabaseAdmin: any,
  args: { user_id: string; instance_id: string | null; phone: string; text: string | null },
): Promise<void> {
  const text = (args.text ?? "").trim();
  if (!text) return;
  const lower = text.toLowerCase();

  // Carrega triggers ativos do usuário, do chip ou globais (instance_id null)
  let q = supabaseAdmin.from("flow_keyword_triggers")
    .select("id, flow_id, instance_id, keywords, match_mode")
    .eq("user_id", args.user_id).eq("active", true);
  const { data: triggers } = await q;
  if (!triggers?.length) return;

  const matched = (triggers as Array<{ id: string; flow_id: string; instance_id: string | null; keywords: string[]; match_mode: string }>).filter((t) => {
    if (t.instance_id && args.instance_id && t.instance_id !== args.instance_id) return false;
    const kws = (t.keywords ?? []).map((k) => k.toLowerCase());
    if (t.match_mode === "exact") return kws.some((k) => k === lower);
    if (t.match_mode === "starts_with") return kws.some((k) => lower.startsWith(k));
    return kws.some((k) => lower.includes(k)); // contains
  });
  if (!matched.length) return;

  // Resolve chip alvo
  let targetInstanceId = args.instance_id;
  if (!targetInstanceId) {
    const { data: inst } = await supabaseAdmin.from("whatsapp_instances")
      .select("id").eq("user_id", args.user_id).eq("status", "connected").limit(1).maybeSingle();
    targetInstanceId = inst?.id ?? null;
  }
  if (!targetInstanceId) return;

  // Resolve/cria contato
  let { data: contact } = await supabaseAdmin.from("contacts")
    .select("id").eq("user_id", args.user_id).eq("phone", args.phone).maybeSingle();
  if (!contact) {
    const { data: created } = await supabaseAdmin.from("contacts").insert({
      user_id: args.user_id, phone: args.phone, name: null,
    }).select("id").single();
    contact = created;
  }
  if (!contact?.id) return;

  for (const t of matched) {
    // Evita disparo duplicado se já há run ativo para esse contato neste flow
    const { data: existing } = await supabaseAdmin.from("flow_runs")
      .select("id").eq("flow_id", t.flow_id).eq("contact_phone", args.phone)
      .in("status", ["pending", "waiting"]).limit(1).maybeSingle();
    if (existing) continue;

    const runId = await createFlowRun(supabaseAdmin, {
      flow_id: t.flow_id,
      user_id: args.user_id,
      contact_id: contact.id,
      contact_phone: args.phone,
      instance_id: targetInstanceId,
      initial_vars: { trigger_text: text },
    });
    if (runId) {
      // Avança até o primeiro estado que pausa (ask/delay) ou termina
      for (let i = 0; i < 20; i++) {
        const { data: r } = await supabaseAdmin.from("flow_runs").select("status").eq("id", runId).maybeSingle();
        if (!r || r.status !== "pending") break;
        await advanceFlowRun(supabaseAdmin, runId);
      }
    }
  }
}
