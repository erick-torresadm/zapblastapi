// Motor de execução de fluxos. Server-only. Processa um node por vez e reagenda via wait_until.
// Inclui suporte a mídia (image/video/audio/document), presence (digitando/gravando)
// e respeita limites anti-banimento por chip (delay humanizado, horário silencioso,
// limite por hora e por dia, validação de número).
import {
  sendText,
  sendMedia,
  sendPresence,
  typingDurationMs,
  isInQuietHours,
  checkWhatsappNumbers,
} from "@/lib/evolution.server";

type Node = { id: string; type: string; data?: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string };
type Flow = { nodes: Node[]; edges: Edge[] };

type InstanceRow = {
  id: string;
  instance_name: string;
  status: string;
  sent_today: number;
  daily_limit: number;
  sent_hour: number;
  sent_hour_at: string | null;
  hourly_limit: number;
  min_delay_ms: number;
  max_delay_ms: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
  typing_enabled: boolean;
  typing_wpm: number;
  validate_numbers: boolean;
  last_sent_at: string | null;
  evolution_servers: { base_url: string; api_key: string } | null;
};

function isLidIdentifier(value: string | null | undefined): boolean {
  const raw = String(value ?? "");
  const user = raw.includes("@") ? raw.split("@")[0] : raw;
  return raw.endsWith("@lid") || /^\d{15,}$/.test(user.replace(/\D/g, ""));
}

function extractRealPhone(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  const user = raw.includes("@") ? raw.split("@")[0] : raw;
  const digits = user.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function toEvolutionTarget(value: string): string {
  if (value.includes("@")) return value;
  return isLidIdentifier(value) ? `${value}@lid` : value;
}

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
    if (next) return flow.nodes.find((n) => n.id === next.target);
    // Fallback: start sem conexão — usa o primeiro nó não-start (fluxo "esquecido" de ligar)
    const fallback = flow.nodes.find((n) => n.type !== "start");
    if (fallback) return fallback;
  }
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
  if (!flow) { console.warn("[flow] createFlowRun: flow não encontrado", args.flow_id); return null; }
  const entry = findEntryNode(flow);
  if (!entry) { console.warn("[flow] createFlowRun: sem nó de entrada (verifique conexões)", args.flow_id); return null; }
  const { data, error } = await supabaseAdmin.from("flow_runs").insert({
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
  if (error) console.error("[flow] createFlowRun insert error", error);
  return data?.id ?? null;
}

// Reseta contadores hora/dia se a janela já expirou. Retorna instância atualizada.
async function refreshCounters(supabaseAdmin: any, inst: InstanceRow): Promise<InstanceRow> {
  const now = new Date();
  const todayUTC = now.toISOString().slice(0, 10);
  const patch: Record<string, unknown> = {};

  // Reset hora
  if (!inst.sent_hour_at || now.getTime() - new Date(inst.sent_hour_at).getTime() >= 3600 * 1000) {
    patch.sent_hour = 0;
    patch.sent_hour_at = now.toISOString();
    inst.sent_hour = 0;
    inst.sent_hour_at = now.toISOString();
  }
  // Reset dia (last_reset_date é outro campo já existente, mas garantimos local também)
  if (inst.last_sent_at && inst.last_sent_at.slice(0, 10) < todayUTC) {
    patch.sent_today = 0;
    inst.sent_today = 0;
  }
  if (Object.keys(patch).length) {
    await supabaseAdmin.from("whatsapp_instances").update(patch).eq("id", inst.id);
  }
  return inst;
}

// Verifica se pode enviar agora. Retorna número de ms a aguardar (0 = pode enviar).
function safetyWaitMs(inst: InstanceRow): number {
  const now = Date.now();
  // 1) quiet hours
  if (isInQuietHours(inst.quiet_start_hour, inst.quiet_end_hour)) {
    // adia até a hora final
    const d = new Date();
    const targetH = inst.quiet_end_hour;
    const brasilHour = (d.getUTCHours() - 3 + 24) % 24;
    let hoursToAdd = (targetH - brasilHour + 24) % 24;
    if (hoursToAdd === 0) hoursToAdd = 24;
    return hoursToAdd * 3600 * 1000;
  }
  // 2) limites
  if (inst.sent_today >= inst.daily_limit) {
    // adia até amanhã 00:00 UTC (suficientemente longo)
    return 6 * 3600 * 1000;
  }
  if (inst.sent_hour >= inst.hourly_limit) {
    const elapsed = inst.sent_hour_at ? now - new Date(inst.sent_hour_at).getTime() : 0;
    return Math.max(60_000, 3600_000 - elapsed);
  }
  // 3) delay humano desde último envio
  if (inst.last_sent_at) {
    const minWait = inst.min_delay_ms;
    const since = now - new Date(inst.last_sent_at).getTime();
    if (since < minWait) return minWait - since;
  }
  return 0;
}

async function bumpCounters(supabaseAdmin: any, inst: InstanceRow) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_instances").update({
    sent_today: inst.sent_today + 1,
    sent_hour: inst.sent_hour + 1,
    sent_hour_at: inst.sent_hour_at ?? nowIso,
    last_sent_at: nowIso,
  }).eq("id", inst.id);
  inst.sent_today++;
  inst.sent_hour++;
  inst.last_sent_at = nowIso;
}

// Executa um único passo do run.
export async function advanceFlowRun(supabaseAdmin: any, runId: string): Promise<void> {
  const { data: run } = await supabaseAdmin.from("flow_runs").select("*").eq("id", runId).maybeSingle();
  if (!run || run.status === "done" || run.status === "failed" || run.status === "stopped") return;

  const flow = await loadFlow(supabaseAdmin, run.flow_id);
  if (!flow) {
    await supabaseAdmin.from("flow_runs").update({ status: "failed", error: "Flow não encontrado", finished_at: new Date().toISOString() }).eq("id", runId);
    return;
  }

  const node = flow.nodes.find((n) => n.id === run.current_node_id);
  if (!node) {
    await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    return;
  }

  const { data: instRaw } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name, status, sent_today, daily_limit, sent_hour, sent_hour_at, hourly_limit, min_delay_ms, max_delay_ms, quiet_start_hour, quiet_end_hour, typing_enabled, typing_wpm, validate_numbers, last_sent_at, evolution_servers(base_url, api_key)")
    .eq("id", run.instance_id)
    .maybeSingle();
  let inst = instRaw as InstanceRow | null;
  if (inst) inst = await refreshCounters(supabaseAdmin, inst);
  const srv = inst?.evolution_servers ?? null;

  const vars = (run.variables ?? {}) as Record<string, string>;
  const data = (node.data ?? {}) as Record<string, unknown>;

  async function logStep(status: "completed" | "failed" | "skipped", error?: string, output?: Record<string, unknown>) {
    await supabaseAdmin.from("flow_run_steps").insert({
      run_id: runId, flow_id: run.flow_id, user_id: run.user_id,
      node_id: node!.id, node_type: node!.type, status, error: error ?? null, output: output ?? null,
    });
  }

  async function goNext(handle?: string) {
    const edge = nextEdge(flow!, node!.id, handle);
    if (!edge) {
      await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
    } else {
      await supabaseAdmin.from("flow_runs").update({
        current_node_id: edge.target, status: "pending", waiting_for: null, wait_until: null,
      }).eq("id", runId);
    }
  }

  // Para nodes que enviam mensagem, verifica anti-ban
  async function gateSafetyOrDefer(): Promise<boolean> {
    if (!inst) return true;
    const wait = safetyWaitMs(inst);
    if (wait <= 0) return true;
    const until = new Date(Date.now() + wait).toISOString();
    await supabaseAdmin.from("flow_runs").update({ status: "waiting", wait_until: until }).eq("id", runId);
    await logStep("skipped", undefined, { deferred_until: until, reason: "anti-ban" });
    return false;
  }

  async function resolveEvolutionTarget(): Promise<string> {
    if (!isLidIdentifier(run.contact_phone)) return toEvolutionTarget(run.contact_phone);
    const { data: recent } = await supabaseAdmin.from("incoming_messages")
      .select("raw_payload")
      .eq("user_id", run.user_id)
      .eq("instance_id", run.instance_id)
      .eq("from_phone", run.contact_phone)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (recent?.raw_payload ?? {}) as { sender?: unknown; data?: { sender?: unknown; key?: { senderPn?: unknown; participantPn?: unknown } } };
    const phone = extractRealPhone(raw.sender)
      ?? extractRealPhone(raw.data?.sender)
      ?? extractRealPhone(raw.data?.key?.senderPn)
      ?? extractRealPhone(raw.data?.key?.participantPn);
    if (phone) {
      console.log("[flow] LID target resolved from webhook sender", { runId, lid: run.contact_phone, target: phone });
      return phone;
    }
    console.warn("[flow] LID target unresolved; falling back to @lid", { runId, lid: run.contact_phone });
    return toEvolutionTarget(run.contact_phone);
  }

  async function sendTextSafely(text: string) {
    if (!srv || !inst || inst.status !== "connected") return;
    const target = await resolveEvolutionTarget();
    if (inst.typing_enabled) {
      const dur = typingDurationMs(text, inst.typing_wpm);
      try { await sendPresence({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, target, "composing", dur); } catch {}
      await new Promise((r) => setTimeout(r, dur));
    }
    await sendText({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, target, text);
    await bumpCounters(supabaseAdmin, inst);
  }


  try {
    if (node.type === "start") {
      await logStep("completed");
      await goNext();
      return;
    }

    if (node.type === "message") {
      const tpl = String(data.message ?? "");
      if (tpl && inst) {
        if (!(await gateSafetyOrDefer())) return;
        // valida número uma vez por run, opcional — agora só AVISA e segue.
        // (a Evolution rejeita com 400 se for inválido de fato e o erro é tratado abaixo.)
        if (inst.validate_numbers && !run.variables?.__validated && srv && !isLidIdentifier(run.contact_phone)) {
          try {
            const res = await checkWhatsappNumbers({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, [run.contact_phone]);
            const ok = Array.isArray(res) && res[0]?.exists !== false;
            if (!ok) {
              await logStep("skipped", undefined, { warning: "Número não confirmado no WhatsApp; enviando mesmo assim" });
            }
            await supabaseAdmin.from("flow_runs").update({ variables: { ...vars, __validated: "1" } }).eq("id", runId);
          } catch (e) {
            console.warn("[flow] validate_numbers failed", (e as Error).message);
          }
        }
        try {
          await sendTextSafely(renderTemplate(tpl, vars));
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[flow] sendText failed", msg);
          await logStep("failed", msg);
          await supabaseAdmin.from("flow_runs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
          return;
        }
      }
      await logStep("completed", undefined, { sent: !!tpl });
      // Avança imediatamente para o próximo nó. Esperas devem ser explícitas
      // via nós "delay" ou "typing"; assim o tempo configurado é exatamente
      // o tempo percebido pelo contato (sem soma de delay anti-ban entre mensagens).
      await goNext();
      return;
    }


    if (node.type === "media") {
      const mediatype = (String(data.mediatype ?? "image")) as "image" | "video" | "audio" | "document";
      const url = String(data.mediaUrl ?? "");
      const caption = data.caption ? renderTemplate(String(data.caption), vars) : undefined;
      const fileName = data.fileName ? String(data.fileName) : undefined;
      if (url && srv && inst && inst.status === "connected") {
        if (!(await gateSafetyOrDefer())) return;
        // presence apropriado pro tipo
        const presence = mediatype === "audio" ? "recording" : "composing";
        const target = await resolveEvolutionTarget();
        try { await sendPresence({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, target, presence, 1500); } catch {}
        await new Promise((r) => setTimeout(r, 1500));
        await sendMedia({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, target, {
          mediatype, media: url, caption, fileName,
        });
        await bumpCounters(supabaseAdmin, inst);
      }
      await logStep("completed", undefined, { sent: !!url, mediatype });
      await goNext();
      return;
    }


    if (node.type === "typing") {
      // Mostra "digitando" ou "gravando" sem enviar nada. Útil pra dar realismo entre mensagens.
      const presence = (String(data.presence ?? "composing")) as "composing" | "recording";
      const secs = Math.max(1, Math.min(15, Number(data.seconds ?? 3)));
      if (srv && inst && inst.status === "connected") {
        try { await sendPresence({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, await resolveEvolutionTarget(), presence, secs * 1000); } catch {}
      }
      await logStep("completed", undefined, { presence, secs });
      const until = new Date(Date.now() + secs * 1000).toISOString();
      const edge = nextEdge(flow!, node!.id);
      if (edge) {
        await supabaseAdmin.from("flow_runs").update({
          current_node_id: edge.target, status: "waiting", wait_until: until,
        }).eq("id", runId);
      } else {
        await goNext();
      }
      return;
    }

    if (node.type === "ask") {
      const tpl = String(data.message ?? "");
      if (tpl && inst) {
        if (!(await gateSafetyOrDefer())) return;
        await sendTextSafely(renderTemplate(tpl, vars));
      }
      await supabaseAdmin.from("flow_runs").update({
        status: "waiting", waiting_for: String(data.variable ?? "resposta"),
      }).eq("id", runId);
      await logStep("completed", undefined, { waiting_for: String(data.variable ?? "resposta") });
      return;
    }

    if (node.type === "delay") {
      if (run.status === "waiting" && run.wait_until && new Date(run.wait_until).getTime() <= Date.now()) {
        await goNext();
        return;
      }
      const secs = Number(data.delaySeconds ?? 60);
      const until = new Date(Date.now() + secs * 1000).toISOString();
      const edge = nextEdge(flow!, node!.id);
      if (edge) {
        await supabaseAdmin.from("flow_runs").update({
          current_node_id: edge.target,
          status: "waiting",
          wait_until: until,
        }).eq("id", runId);
      } else {
        await supabaseAdmin.from("flow_runs").update({
          status: "done",
          finished_at: new Date().toISOString(),
          current_node_id: null,
          wait_until: null,
        }).eq("id", runId);
      }
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

    if (node.type === "tag") {
      const tag = String(data.tag ?? "").trim();
      if (tag) {
        const { data: c } = await supabaseAdmin.from("contacts").select("variables").eq("id", run.contact_id).maybeSingle();
        const cv = (c?.variables ?? {}) as Record<string, unknown>;
        const tagsRaw = Array.isArray(cv._tags) ? (cv._tags as string[]) : [];
        const tagsSet = new Set([...tagsRaw, tag]);
        await supabaseAdmin.from("contacts").update({ variables: { ...cv, _tags: Array.from(tagsSet) } }).eq("id", run.contact_id);
      }
      await logStep("completed", undefined, { tag });
      await goNext();
      return;
    }

    if (node.type === "webhook") {
      const url = String(data.webhookUrl ?? "");
      if (url) {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              run_id: runId, flow_id: run.flow_id, contact_id: run.contact_id,
              phone: run.contact_phone, variables: vars,
            }),
          });
          let body: unknown = null;
          try { body = await resp.json(); } catch { body = await resp.text(); }
          // Se a resposta for objeto, mescla nas variables
          if (body && typeof body === "object" && !Array.isArray(body)) {
            const merged = { ...vars, ...(body as Record<string, string>) };
            await supabaseAdmin.from("flow_runs").update({ variables: merged }).eq("id", runId);
          }
          await logStep("completed", undefined, { status: resp.status });
        } catch (e) {
          await logStep("failed", (e as Error).message);
        }
      } else {
        await logStep("skipped", "URL vazia");
      }
      await goNext();
      return;
    }

    if (node.type === "ai") {
      const sys = String(data.systemPrompt ?? "Você é um atendente educado e direto.");
      const userInput = renderTemplate(String(data.userInput ?? ""), vars);
      const apiKey = process.env.LOVABLE_API_KEY;
      let reply = "";
      if (apiKey && userInput) {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "system", content: sys }, { role: "user", content: userInput }],
            }),
          });
          const j = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          reply = j.choices?.[0]?.message?.content?.trim() ?? "";
        } catch (e) {
          await logStep("failed", (e as Error).message);
        }
      }
      if (reply && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try { await sendTextSafely(reply); } catch (e) { await logStep("failed", (e as Error).message); }
      }
      await logStep("completed", undefined, { sent: !!reply, reply: reply.slice(0, 200) });
      await goNext();
      return;
    }

    if (node.type === "transfer_human") {
      const tpl = String(data.message ?? "").trim();
      if (tpl && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try { await sendTextSafely(renderTemplate(tpl, vars)); } catch (e) {
          await logStep("failed", (e as Error).message);
        }
      }
      // Abre conversa no CRM como "open" e remove o agente atribuído pra fila do time
      await supabaseAdmin.from("crm_conversations")
        .update({ status: "open", assigned_agent_id: null, updated_at: new Date().toISOString() })
        .eq("owner_user_id", run.user_id)
        .eq("contact_phone", run.contact_phone);
      await logStep("completed", undefined, { handed_off: true });
      await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
      return;
    }

    await logStep("completed");
    await goNext();
  } catch (e) {
    const msg = (e as Error).message;
    await logStep("failed", msg);
    await supabaseAdmin.from("flow_runs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
  }
}

// Resume runs aguardando resposta deste contato.
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
      ...(edge ? {} : { finished_at: new Date().toISOString(), status: "done" }),
    }).eq("id", r.id);
  }
}

// Verifica triggers por keyword e dispara o fluxo.
export async function triggerKeywordFlows(
  supabaseAdmin: any,
  args: { user_id: string; instance_id: string | null; phone: string; text: string | null; from_me?: boolean },
): Promise<{ matched: number; runs: string[] }> {
  const text = (args.text ?? "").trim();
  console.log("[trigger] start", { user_id: args.user_id, phone: args.phone, from_me: !!args.from_me, text_len: text.length });
  if (!text) return { matched: 0, runs: [] };
  const lower = text.toLowerCase();

  const { data: triggers, error: tErr } = await supabaseAdmin.from("flow_keyword_triggers")
    .select("id, flow_id, instance_id, keywords, match_mode, allow_from_me, delay_seconds, cooldown_seconds, last_triggered_at")
    .eq("user_id", args.user_id).eq("active", true);
  if (tErr) { console.error("[trigger] load triggers error", tErr); return { matched: 0, runs: [] }; }
  console.log("[trigger] active triggers", triggers?.length ?? 0);
  if (!triggers?.length) return { matched: 0, runs: [] };

  type TriggerRow = {
    id: string; flow_id: string; instance_id: string | null;
    keywords: string[]; match_mode: string;
    allow_from_me: boolean; delay_seconds: number;
    cooldown_seconds: number; last_triggered_at: string | null;
  };

  const now = Date.now();
  const matched = (triggers as TriggerRow[]).filter((t) => {
    if (args.from_me && !t.allow_from_me) { console.log("[trigger] skip (fromMe blocked)", t.id); return false; }
    if (t.instance_id && args.instance_id && t.instance_id !== args.instance_id) { console.log("[trigger] skip (instance mismatch)", t.id); return false; }
    if (t.cooldown_seconds > 0 && t.last_triggered_at) {
      const elapsed = (now - new Date(t.last_triggered_at).getTime()) / 1000;
      if (elapsed < t.cooldown_seconds) { console.log("[trigger] skip (cooldown)", t.id, elapsed); return false; }
    }
    const kws = (t.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
    if (!kws.length) return false;
    let hit = false;
    if (t.match_mode === "exact") hit = kws.includes(lower);
    else if (t.match_mode === "starts_with") hit = kws.some((k) => lower.startsWith(k));
    else hit = kws.some((k) => lower.includes(k));
    console.log("[trigger] eval", t.id, { mode: t.match_mode, kws, hit });
    return hit;
  });

  console.log("[trigger] matched", matched.length);
  if (!matched.length) return { matched: 0, runs: [] };

  // resolve instance_id default (primeiro chip conectado do user)
  let instanceId = args.instance_id;
  if (!instanceId) {
    const { data: inst } = await supabaseAdmin.from("whatsapp_instances")
      .select("id").eq("user_id", args.user_id).eq("status", "connected").limit(1).maybeSingle();
    instanceId = inst?.id ?? null;
  }
  if (!instanceId) {
    console.warn("[trigger] no connected instance available — aborting");
    return { matched: matched.length, runs: [] };
  }

  // upsert contato
  const { data: existing } = await supabaseAdmin.from("contacts")
    .select("id").eq("user_id", args.user_id).eq("phone", args.phone).maybeSingle();
  let contactId = existing?.id;
  if (!contactId) {
    const { data: created } = await supabaseAdmin.from("contacts")
      .insert({ user_id: args.user_id, phone: args.phone, name: null, list_id: null })
      .select("id").single();
    contactId = created?.id;
  }
  if (!contactId) return { matched: matched.length, runs: [] };

  const runs: string[] = [];
  for (const t of matched) {
    const runId = await createFlowRun(supabaseAdmin, {
      flow_id: t.flow_id, user_id: args.user_id,
      contact_id: contactId, contact_phone: args.phone, instance_id: instanceId,
      initial_vars: { __trigger_keyword: lower, __trigger_id: t.id },
    });
    console.log("[trigger] created run", { trigger: t.id, run: runId, flow: t.flow_id, phone: args.phone });

    if (runId) {
      runs.push(runId);
      // Step "triggered" para aparecer na fila do painel imediatamente
      await supabaseAdmin.from("flow_run_steps").insert({
        run_id: runId, flow_id: t.flow_id, user_id: args.user_id,
        node_id: "__trigger__", node_type: "trigger", status: "completed",
        output: { keyword: lower, trigger_id: t.id, phone: args.phone, from_me: !!args.from_me },
      });

      if (t.delay_seconds > 0) {
        const waitUntil = new Date(Date.now() + t.delay_seconds * 1000).toISOString();
        await supabaseAdmin.from("flow_runs")
          .update({ status: "waiting", wait_until: waitUntil })
          .eq("id", runId);
      }
    }

    await supabaseAdmin.from("flow_keyword_triggers")
      .update({ last_triggered_at: new Date().toISOString() })
      .eq("id", t.id);
  }
  return { matched: matched.length, runs };
}

