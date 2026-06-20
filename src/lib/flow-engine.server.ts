// Motor de execução de fluxos. Server-only. Processa um node por vez e reagenda via wait_until.
// Inclui suporte a mídia (image/video/audio/document), presence (digitando/gravando)
// e respeita limites anti-banimento por chip (delay humanizado, horário silencioso,
// limite por hora e por dia, validação de número).
import {
  sendText,
  sendMedia,
  sendWhatsAppAudio,
  sendPresence,
  sendSticker,
  sendLocation,
  sendContact,
  sendReaction,
  sendPoll,
  typingDurationMs,
  isInQuietHours,
  checkWhatsappNumbers,
} from "@/lib/evolution.server";

type Node = { id: string; type: string; data?: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle?: string };
type Flow = { nodes: Node[]; edges: Edge[] };
type SendAttemptResult = { target: string; response: Record<string, unknown> | null };

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

function extractPersonalJid(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw.includes("@")) return null;
  const [user, domain] = raw.split("@");
  if (!user || user === "status") return null;
  if (!["s.whatsapp.net", "c.us"].includes(domain)) return null;
  return raw;
}

function toPhoneJid(value: string): string | null {
  const phone = extractRealPhone(value);
  return phone ? `${phone}@s.whatsapp.net` : null;
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function toEvolutionTarget(value: string): string {
  if (value.includes("@")) return value;
  return isLidIdentifier(value) ? `${value}@lid` : value;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function normalizeKeywordText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
function safetyWaitMs(inst: InstanceRow, opts: { respectQuietHours?: boolean; respectHumanDelay?: boolean } = {}): number {
  const now = Date.now();
  // 1) quiet hours
  if (opts.respectQuietHours && isInQuietHours(inst.quiet_start_hour, inst.quiet_end_hour)) {
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
  if (opts.respectHumanDelay && inst.last_sent_at) {
    const minWait = inst.min_delay_ms;
    const since = now - new Date(inst.last_sent_at).getTime();
    if (since < minWait) return minWait - since;
  }
  return 0;
}

async function bumpCounters(supabaseAdmin: any, inst: InstanceRow) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_instances").update({
    status: "connected",
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
  let allowSafetyReprocess = false;
  let askTimedOut = false;
  if (run.status === "waiting") {
    if (run.waiting_for) {
      // ask/menu com timeout configurado → expira sem resposta
      if (run.wait_until && new Date(run.wait_until).getTime() <= Date.now()) {
        askTimedOut = true;
      } else {
        return;
      }
    }
    if (!askTimedOut && run.wait_until && new Date(run.wait_until).getTime() > Date.now()) {
      const { data: lastSafetyStep } = await supabaseAdmin.from("flow_run_steps")
        .select("id, output")
        .eq("run_id", runId)
        .eq("node_id", run.current_node_id)
        .eq("status", "skipped")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const reason = String((lastSafetyStep?.output as { reason?: unknown } | null)?.reason ?? "");
      allowSafetyReprocess = reason === "anti-ban" || reason === "rate-limit";
      if (!allowSafetyReprocess) return;
    }
  }
  if (!["pending", "waiting"].includes(run.status)) return;

  let claim = supabaseAdmin.from("flow_runs").update({ status: "running" }).eq("id", runId).eq("status", run.status);
  if (run.status === "waiting" && !allowSafetyReprocess && !askTimedOut) claim = claim.lte("wait_until", new Date().toISOString()).is("waiting_for", null);
  if (askTimedOut) claim = claim.not("waiting_for", "is", null);
  const { data: claimed } = await claim.select("id").maybeSingle();
  if (!claimed) return;


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

  // ask/menu com timeout expirado → roteia via handle "timeout"
  if (askTimedOut) {
    await supabaseAdmin.from("flow_run_steps").insert({
      run_id: runId, flow_id: run.flow_id, user_id: run.user_id,
      node_id: node.id, node_type: node.type, status: "ok",
      output: { timeout: true, waiting_for: run.waiting_for },
    });
    const edge = nextEdge(flow!, node.id, "timeout") ?? nextEdge(flow!, node.id);
    if (!edge) {
      await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString(), current_node_id: null, waiting_for: null, wait_until: null }).eq("id", runId);
    } else {
      await supabaseAdmin.from("flow_runs").update({ current_node_id: edge.target, status: "pending", waiting_for: null, wait_until: null }).eq("id", runId);
    }
    return;
  }


  async function logStep(status: "ok" | "error" | "skipped", error?: string, output?: Record<string, unknown>) {
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
    const hasSentInThisRun = !!run.variables?.__flow_has_sent;
    const wait = safetyWaitMs(inst, { respectQuietHours: false, respectHumanDelay: !hasSentInThisRun });
    if (wait <= 0) return true;
    const until = new Date(Date.now() + wait).toISOString();
    await supabaseAdmin.from("flow_runs").update({ status: "waiting", wait_until: until }).eq("id", runId);
    await logStep("skipped", undefined, { deferred_until: until, reason: hasSentInThisRun ? "rate-limit" : "anti-ban" });
    return false;
  }

  async function markFlowSent() {
    if (vars.__flow_has_sent) return;
    vars.__flow_has_sent = "1";
    await supabaseAdmin.from("flow_runs").update({ variables: vars }).eq("id", runId);
  }

  // Brasil: alguns números têm o "9" extra que o WhatsApp não armazena.
  // Ex: 5511981738903 (13 dígitos) <-> 551181738903 (12 dígitos)
  function brazilianPhoneVariants(phone: string): string[] {
    const out = new Set<string>([phone]);
    const local = phone.match(/^(\d{2})(9?)(\d{8})$/);
    if (local) {
      const [, ddd, nine, rest] = local;
      out.add(`55${ddd}${nine}${rest}`);
      out.add(`55${ddd}${rest}`);
      if (!nine) out.add(`55${ddd}9${rest}`);
    }
    const m = phone.match(/^55(\d{2})(9?)(\d{8})$/);
    if (m) {
      const [, ddd, nine, rest] = m;
      out.add(`55${ddd}${rest}`);
      if (!nine) out.add(`55${ddd}9${rest}`);
    }
    return Array.from(out);
  }

  async function resolveEvolutionTargets(): Promise<string[]> {
    const { data: recent } = await supabaseAdmin.from("incoming_messages")
      .select("raw_payload")
      .eq("user_id", run.user_id)
      .eq("instance_id", run.instance_id)
      .eq("from_phone", run.contact_phone)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (recent?.raw_payload ?? {}) as {
      sender?: unknown;
      data?: { sender?: unknown; key?: { remoteJid?: unknown; senderPn?: unknown; participantPn?: unknown } };
    };
    const remoteJid = String(raw.data?.key?.remoteJid ?? "");
    const remotePhone = extractRealPhone(remoteJid);

    const phones = uniq([
      extractRealPhone(raw.data?.key?.senderPn),
      extractRealPhone(raw.data?.key?.participantPn),
      remotePhone,
      extractRealPhone(run.contact_phone),
    ]);

    const phoneVariants: string[] = [];
    for (const p of phones) {
      for (const v of brazilianPhoneVariants(p)) {
        phoneVariants.push(v);
      }
    }

    const validatedTargets: string[] = [];
    if (srv && inst && phoneVariants.length > 0) {
      try {
        const checked = await checkWhatsappNumbers(
          { base_url: srv.base_url, api_key: srv.api_key },
          inst.instance_name,
          uniq(phoneVariants),
        );
        for (const row of checked) {
          if (!row?.exists) continue;
          const jid = extractPersonalJid(row.jid);
          const phone = extractRealPhone(row.jid) ?? extractRealPhone(row.number);
          if (jid) validatedTargets.push(jid);
          if (phone) validatedTargets.push(phone);
        }
      } catch (e) {
        console.warn("[flow] target validation failed", (e as Error).message);
      }
    }

    const targets: string[] = [];
    for (const t of [...validatedTargets, ...phoneVariants]) {
      const jid = extractPersonalJid(t);
      if (jid) {
        targets.push(jid);
        const phoneJid = toPhoneJid(jid);
        if (phoneJid && phoneJid !== jid) targets.push(phoneJid);
        const phone = extractRealPhone(jid);
        if (phone) targets.push(phone);
        continue;
      }
      const phone = extractRealPhone(t);
      if (!phone) continue;
      targets.push(`${phone}@s.whatsapp.net`, phone);
    }

    // Último recurso: tenta o remoteJid LID (chips com migração LID).
    if (remoteJid.endsWith("@lid")) targets.push(remoteJid);

    if (targets.length === 0) {
      const fallback = extractRealPhone(run.contact_phone);
      if (fallback) targets.push(fallback, `${fallback}@s.whatsapp.net`);
      else targets.push(toEvolutionTarget(run.contact_phone));
    }
    return uniq(targets);
  }

  async function resolveEvolutionTarget(): Promise<string> {
    const list = await resolveEvolutionTargets();
    return list[0]!;
  }


  async function sendTextSafely(text: string): Promise<SendAttemptResult | null> {
    if (!srv || !inst) return null;
    const targets = await resolveEvolutionTargets();
    const primary = targets[0]!;
    console.log("[flow] sendText targets", { runId, phone: run.contact_phone, targets });
    if (inst.typing_enabled) {
      const dur = typingDurationMs(text, inst.typing_wpm);
      // Evolution's /chat/sendPresence holds the request for `delay` ms while
      // the presence is visible to the recipient, then returns. Awaiting it
      // is enough — do NOT add an extra local sleep or the indicator clears
      // before the message arrives.
      try { await sendPresence({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, primary, "composing", dur); } catch {}
    }
    let lastErr: Error | null = null;
    for (const t of targets) {
      try {
        const response = await sendText({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, t, text);
        await bumpCounters(supabaseAdmin, inst);
        await markFlowSent();
        console.log("[flow] sendText ok", { runId, phone: run.contact_phone, target: t, response });
        return { target: t, response };
      } catch (e) {
        lastErr = e as Error;
        console.warn("[flow] sendText failed, trying next target", { tried: t, err: lastErr.message });
      }
    }
    throw lastErr ?? new Error("Falha ao enviar mensagem (nenhum alvo válido)");
  }

  async function sendMediaSafely(
    mediatype: "image" | "video" | "audio" | "document",
    url: string,
    caption?: string,
    fileName?: string,
  ): Promise<SendAttemptResult | null> {
    if (!srv || !inst) return null;
    const evoSrv = { base_url: srv.base_url, api_key: srv.api_key };
    const targets = await resolveEvolutionTargets();
    const primary = targets[0]!;
    const presence = mediatype === "audio" ? "recording" : "composing";
    // Show "recording audio" / "typing" for ~2.5s (audio) or ~1.5s (others).
    // Evolution holds the presence open for `delay` ms — await is enough.
    const presenceMs = mediatype === "audio" ? 2500 : 1500;
    try { await sendPresence(evoSrv, inst.instance_name, primary, presence, presenceMs); } catch {}

    let lastErr: Error | null = null;
    for (const t of targets) {
      try {
        let response: Record<string, unknown>;
        if (mediatype === "audio") {
          // PTT voice note (waveform UI).
          // Evolution's transcoder (encoding:true) falha com 400 quando recebe
          // URL de OGG/Opus já no formato final (tenta re-encodar e quebra).
          // Estratégia: se já é .ogg/.oga, baixamos e mandamos em base64 sem encoding;
          // outros formatos (mp3/m4a/wav) → deixa Evolution baixar + transcodar.
          const isOgg = /\.(ogg|oga|opus)(\?|$)/i.test(url);
          let audioPayload = url;
          let encoding = true;
          if (isOgg) {
            encoding = false;
            try {
              const r = await fetch(url);
              if (r.ok) {
                const buf = new Uint8Array(await r.arrayBuffer());
                let bin = "";
                for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
                audioPayload = btoa(bin);
              }
            } catch (e) {
              console.warn("[flow] failed to prefetch ogg, falling back to URL", (e as Error).message);
            }
          }
          try {
            response = await sendWhatsAppAudio(evoSrv, inst.instance_name, t, audioPayload, { encoding });
          } catch (audioErr) {
            console.warn("[flow] sendWhatsAppAudio failed, falling back to regular audio media", {
              target: t,
              err: (audioErr as Error).message,
            });
            response = await sendMedia(evoSrv, inst.instance_name, t, {
              mediatype: "audio",
              media: url,
              caption,
              fileName,
            });
          }

        } else {
          response = await sendMedia(evoSrv, inst.instance_name, t, { mediatype, media: url, caption, fileName });
        }
        await bumpCounters(supabaseAdmin, inst);
        await markFlowSent();
        console.log("[flow] sendMedia ok", { runId, mediatype, target: t, response });
        return { target: t, response };
      } catch (e) {
        lastErr = e as Error;
        console.warn("[flow] sendMedia failed, trying next target", { tried: t, err: lastErr.message });
      }
    }
    throw lastErr ?? new Error("Falha ao enviar mídia (nenhum alvo válido)");
  }


  try {
    if (node.type === "start") {
      await logStep("ok");
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
          const sent = await sendTextSafely(renderTemplate(tpl, vars));
          await logStep("ok", undefined, { sent: !!sent, target: sent?.target, response: sent?.response });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[flow] sendText failed", msg);
          await logStep("error", msg);
          await supabaseAdmin.from("flow_runs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", runId);
          return;
        }
      } else {
        await logStep("ok", undefined, { sent: false });
      }
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
      if (url && srv && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try {
          const sent = await sendMediaSafely(mediatype, url, caption, fileName);
          await logStep("ok", undefined, { sent: !!sent, mediatype, target: sent?.target, response: sent?.response });
        } catch (e) {
          const msg = (e as Error).message;
          console.error("[flow] sendMedia failed", msg);
          await logStep("error", msg);
          await goNext();
          return;
        }
      } else {
        await logStep("ok", undefined, { sent: false, mediatype });
      }
      await goNext();
      return;
    }


    if (node.type === "typing") {
      // Mostra "digitando" ou "gravando" sem enviar nada. Útil pra dar realismo entre mensagens.
      const presence = (String(data.presence ?? "composing")) as "composing" | "recording";
      const secs = Math.max(1, Math.min(15, Number(data.seconds ?? 3)));
      if (srv && inst) {
        try { await sendPresence({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, await resolveEvolutionTarget(), presence, secs * 1000); } catch {}
      }
      await logStep("ok", undefined, { presence, secs });
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

    if (node.type === "ask" || node.type === "menu") {
      let tpl = String(data.message ?? "");
      if (node.type === "menu") {
        const opts = String(data.menuOptions ?? "")
          .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (opts.length && !/\b1\b/.test(tpl)) {
          tpl = tpl + (tpl ? "\n\n" : "") + opts.map((o, i) => `${i + 1}. ${o}`).join("\n");
        }
      }
      if (tpl && inst) {
        if (!(await gateSafetyOrDefer())) return;
        await sendTextSafely(renderTemplate(tpl, vars));
      }
      const variable = String(data.variable ?? (node.type === "menu" ? "menu_opcao" : "resposta"));
      const timeoutSecs = Math.max(0, Number(data.timeoutSeconds ?? 0));
      const patch: Record<string, unknown> = { status: "waiting", waiting_for: variable };
      if (timeoutSecs > 0) patch.wait_until = new Date(Date.now() + timeoutSecs * 1000).toISOString();
      await supabaseAdmin.from("flow_runs").update(patch).eq("id", runId);
      await logStep("ok", undefined, { waiting_for: variable, timeout_seconds: timeoutSecs || null });
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
      await logStep("ok", undefined, { wait_until: until });
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
      await logStep("ok", undefined, { result: yes });
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
      await logStep("ok", undefined, { tag });
      await goNext();
      return;
    }

    if (node.type === "webhook" || node.type === "http_request") {
      const url = renderTemplate(String(data.webhookUrl ?? data.url ?? ""), vars);
      const method = String(data.method ?? "POST").toUpperCase();
      const retries = Math.max(0, Math.min(5, Number(data.retries ?? (node.type === "webhook" ? 2 : 0))));
      const savePath = String(data.savePath ?? "").trim(); // ex: "data.items.0.id"
      const saveVar = String(data.saveVar ?? "").trim();
      let headers: Record<string, string> = { "content-type": "application/json" };
      try {
        const hraw = data.headers;
        if (typeof hraw === "string" && hraw.trim()) Object.assign(headers, JSON.parse(renderTemplate(hraw, vars)));
        else if (hraw && typeof hraw === "object") Object.assign(headers, hraw as Record<string, string>);
      } catch { /* ignora json inválido */ }
      let bodyStr: string | undefined;
      if (method !== "GET" && method !== "HEAD") {
        if (data.body !== undefined && data.body !== null && String(data.body).length) {
          bodyStr = renderTemplate(String(data.body), vars);
        } else {
          bodyStr = JSON.stringify({
            run_id: runId, flow_id: run.flow_id, contact_id: run.contact_id,
            phone: run.contact_phone, variables: vars,
          });
        }
      }
      if (!url) {
        await logStep("skipped", "URL vazia");
        await goNext();
        return;
      }
      let attempt = 0;
      let lastErr: string | null = null;
      let succeeded = false;
      while (attempt <= retries && !succeeded) {
        attempt++;
        try {
          const resp = await fetch(url, { method, headers, body: bodyStr });
          let body: unknown = null;
          const ct = resp.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            try { body = await resp.json(); } catch { body = await resp.text(); }
          } else {
            try { body = await resp.text(); } catch { body = null; }
          }
          if (!resp.ok) {
            lastErr = `HTTP ${resp.status}`;
            // 5xx: retry; 4xx: não retry
            if (resp.status < 500 || attempt > retries) {
              await logStep("error", lastErr, { status: resp.status, body });
              await goNext("error");
              return;
            }
            await new Promise((r) => setTimeout(r, Math.min(2000, 250 * attempt)));
            continue;
          }
          // mescla resposta nas variáveis (compatibilidade)
          if (body && typeof body === "object" && !Array.isArray(body) && !saveVar) {
            const merged = { ...vars, ...(body as Record<string, string>) };
            await supabaseAdmin.from("flow_runs").update({ variables: merged }).eq("id", runId);
          }
          // savePath: extrai campo aninhado e salva em saveVar
          if (saveVar) {
            let value: unknown = body;
            if (savePath) {
              for (const seg of savePath.split(".")) {
                if (value == null) break;
                value = (value as Record<string, unknown>)[seg];
              }
            }
            const merged = { ...vars, [saveVar]: value == null ? "" : (typeof value === "object" ? JSON.stringify(value) : String(value)) };
            await supabaseAdmin.from("flow_runs").update({ variables: merged }).eq("id", runId);
          }
          await logStep("ok", undefined, { status: resp.status, attempts: attempt });
          succeeded = true;
        } catch (e) {
          lastErr = (e as Error).message;
          if (attempt > retries) {
            await logStep("error", lastErr);
            await goNext("error");
            return;
          }
          await new Promise((r) => setTimeout(r, Math.min(2000, 250 * attempt)));
        }
      }
      await goNext(succeeded ? "ok" : "error");
      return;
    }

    if (node.type === "ai") {
      const sys = String(data.systemPrompt ?? "Você é um atendente educado e direto.");
      const userInput = renderTemplate(String(data.userInput ?? ""), vars);
      const model = String(data.model ?? "google/gemini-3-flash-preview");
      const apiKey = process.env.LOVABLE_API_KEY;
      let reply = "";
      if (apiKey && userInput) {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [{ role: "system", content: sys }, { role: "user", content: userInput }],
            }),
          });
          const j = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          reply = j.choices?.[0]?.message?.content?.trim() ?? "";
        } catch (e) {
          await logStep("error", (e as Error).message);
        }
      }
      const saveVar = String(data.saveVar ?? "").trim();
      if (saveVar && reply) {
        await supabaseAdmin.from("flow_runs").update({ variables: { ...vars, [saveVar]: reply } }).eq("id", runId);
      }
      const shouldSend = data.send === false ? false : true;
      if (reply && shouldSend && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try { await sendTextSafely(reply); } catch (e) { await logStep("error", (e as Error).message); }
      }
      await logStep("ok", undefined, { sent: !!reply && shouldSend, model, reply: reply.slice(0, 200) });
      await goNext();
      return;
    }



    if (node.type === "sticker") {
      const url = String(data.stickerUrl ?? "");
      if (url && srv && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try {
          const t = await resolveEvolutionTarget();
          const resp = await sendSticker({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, t, url);
          await bumpCounters(supabaseAdmin, inst);
          await markFlowSent();
          await logStep("ok", undefined, { sent: true, target: t, response: resp });
        } catch (e) {
          await logStep("error", (e as Error).message);
        }
      } else {
        await logStep("skipped", "Sticker sem URL ou instância desconectada");
      }
      await goNext();
      return;
    }

    if (node.type === "location") {
      const lat = Number(data.latitude);
      const lng = Number(data.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && srv && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try {
          const t = await resolveEvolutionTarget();
          const resp = await sendLocation({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, t, {
            name: data.locationName ? String(data.locationName) : undefined,
            address: data.locationAddress ? String(data.locationAddress) : undefined,
            latitude: lat,
            longitude: lng,
          });
          await bumpCounters(supabaseAdmin, inst);
          await markFlowSent();
          await logStep("ok", undefined, { sent: true, target: t, response: resp });
        } catch (e) {
          await logStep("error", (e as Error).message);
        }
      } else {
        await logStep("skipped", "Localização sem coordenadas");
      }
      await goNext();
      return;
    }

    if (node.type === "contact_card") {
      const fullName = String(data.contactName ?? "").trim();
      const phone = String(data.contactPhone ?? "").replace(/\D/g, "");
      if (fullName && phone && srv && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try {
          const t = await resolveEvolutionTarget();
          const resp = await sendContact({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, t, [{
            fullName,
            wuid: phone,
            phoneNumber: phone,
            organization: data.contactOrg ? String(data.contactOrg) : undefined,
            email: data.contactEmail ? String(data.contactEmail) : undefined,
          }]);
          await bumpCounters(supabaseAdmin, inst);
          await markFlowSent();
          await logStep("ok", undefined, { sent: true, target: t, response: resp });
        } catch (e) {
          await logStep("error", (e as Error).message);
        }
      } else {
        await logStep("skipped", "Cartão de contato incompleto");
      }
      await goNext();
      return;
    }

    if (node.type === "poll") {
      const name = renderTemplate(String(data.pollQuestion ?? ""), vars).trim();
      const raw = String(data.pollOptions ?? "");
      const values = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const selectable = Math.max(1, Math.min(values.length || 1, Number(data.pollSelectable ?? 1)));
      if (name && values.length >= 2 && srv && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try {
          const t = await resolveEvolutionTarget();
          const resp = await sendPoll({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, t, {
            name, values, selectableCount: selectable,
          });
          await bumpCounters(supabaseAdmin, inst);
          await markFlowSent();
          await logStep("ok", undefined, { sent: true, target: t, response: resp });
        } catch (e) {
          await logStep("error", (e as Error).message);
        }
      } else {
        await logStep("skipped", "Enquete precisa de pergunta + 2 opções");
      }
      await goNext();
      return;
    }

    if (node.type === "reaction") {
      // Reage à ÚLTIMA mensagem recebida do contato (chat_messages direction='in').
      const emoji = String(data.emoji ?? "👍");
      if (srv && inst) {
        const { data: last } = await supabaseAdmin
          .from("chat_messages")
          .select("evolution_message_id, contact_jid, contact_phone")
          .eq("user_id", run.user_id)
          .eq("contact_phone", run.contact_phone)
          .eq("direction", "in")
          .not("evolution_message_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.evolution_message_id) {
          try {
            const remoteJid = last.contact_jid ?? `${(last.contact_phone ?? "").replace(/\D/g, "")}@s.whatsapp.net`;
            const resp = await sendReaction({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name,
              { remoteJid, fromMe: false, id: last.evolution_message_id }, emoji);
            await logStep("ok", undefined, { reacted: true, emoji, response: resp });
          } catch (e) {
            await logStep("error", (e as Error).message);
          }
        } else {
          await logStep("skipped", "Sem mensagem do contato para reagir");
        }
      } else {
        await logStep("skipped", "Instância desconectada");
      }
      await goNext();
      return;
    }

    if (node.type === "transfer_human") {
      const tpl = String(data.message ?? "").trim();
      if (tpl && inst) {
        if (!(await gateSafetyOrDefer())) return;
        try { await sendTextSafely(renderTemplate(tpl, vars)); } catch (e) {
          await logStep("error", (e as Error).message);
        }
      }
      // Abre conversa no CRM como "open" e remove o agente atribuído pra fila do time
      await supabaseAdmin.from("crm_conversations")
        .update({ status: "open", assigned_agent_id: null, updated_at: new Date().toISOString() })
        .eq("owner_user_id", run.user_id)
        .eq("contact_phone", run.contact_phone);
      await logStep("ok", undefined, { handed_off: true });
      await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
      return;
    }

    // ============ Novos nós utilitários ============

    if (node.type === "comment") {
      // sticky note: não executa, só segue.
      await goNext();
      return;
    }

    if (node.type === "end") {
      await logStep("ok", undefined, { ended: true, reason: data.reason ?? null });
      await supabaseAdmin.from("flow_runs").update({ status: "done", finished_at: new Date().toISOString(), current_node_id: null }).eq("id", runId);
      return;
    }

    if (node.type === "jump") {
      const targetId = String(data.jumpTo ?? "").trim();
      const found = targetId ? flow!.nodes.find((n) => n.id === targetId) : undefined;
      if (!found) {
        await logStep("skipped", "Nó destino não encontrado");
        await goNext();
        return;
      }
      await logStep("ok", undefined, { jumped_to: targetId });
      await supabaseAdmin.from("flow_runs").update({
        current_node_id: targetId, status: "pending", waiting_for: null, wait_until: null,
      }).eq("id", runId);
      return;
    }

    if (node.type === "set_variable") {
      const updates: Record<string, string> = {};
      // Modo único: {variable, value}
      const single = String(data.variable ?? "").trim();
      if (single) updates[single] = renderTemplate(String(data.value ?? ""), vars);
      // Modo múltiplo: pairs string "var=valor" por linha
      const pairsRaw = String(data.pairs ?? "");
      pairsRaw.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf("=");
        if (idx <= 0) return;
        const k = line.slice(0, idx).trim();
        const v = renderTemplate(line.slice(idx + 1).trim(), vars);
        if (k) updates[k] = v;
      });
      if (Object.keys(updates).length) {
        await supabaseAdmin.from("flow_runs").update({ variables: { ...vars, ...updates } }).eq("id", runId);
      }
      await logStep("ok", undefined, { set: Object.keys(updates) });
      await goNext();
      return;
    }

    if (node.type === "random_split") {
      // weights: "a=2\nb=1\nc=1" -> handles "a","b","c"
      const raw = String(data.weights ?? "a=1\nb=1");
      const items = raw.split(/\r?\n/).map((l) => {
        const [k, v] = l.split("=");
        const w = Math.max(0, Number(v ?? 1));
        return { handle: (k ?? "").trim(), weight: Number.isFinite(w) ? w : 1 };
      }).filter((x) => x.handle);
      const total = items.reduce((s, x) => s + x.weight, 0);
      let pick = items[0]?.handle ?? "a";
      if (total > 0) {
        let r = Math.random() * total;
        for (const it of items) { r -= it.weight; if (r <= 0) { pick = it.handle; break; } }
      }
      await logStep("ok", undefined, { picked: pick });
      await goNext(pick);
      return;
    }

    if (node.type === "time_window") {
      // Horário comercial em BR (UTC-3). Handles: "in" / "out".
      const startH = Math.max(0, Math.min(23, Number(data.startHour ?? 9)));
      const endH = Math.max(0, Math.min(24, Number(data.endHour ?? 18)));
      const days = String(data.days ?? "1,2,3,4,5").split(",").map((d) => Number(d.trim())).filter((d) => Number.isFinite(d));
      const now = new Date();
      const brHour = (now.getUTCHours() - 3 + 24) % 24;
      const brDow = (now.getUTCDay() + (now.getUTCHours() < 3 ? 6 : 0)) % 7; // 0=dom
      const inDay = days.includes(brDow);
      const inHour = startH <= endH ? (brHour >= startH && brHour < endH) : (brHour >= startH || brHour < endH);
      const inside = inDay && inHour;
      await logStep("ok", undefined, { inside, brHour, brDow });
      await goNext(inside ? "in" : "out");
      return;
    }

    if (node.type === "update_contact") {
      const { data: c } = await supabaseAdmin.from("contacts").select("name, email, variables").eq("id", run.contact_id).maybeSingle();
      const patch: Record<string, unknown> = {};
      const cv = (c?.variables ?? {}) as Record<string, unknown>;
      const nextVars = { ...cv };
      if (data.contactName) patch.name = renderTemplate(String(data.contactName), vars);
      if (data.contactEmail) patch.email = renderTemplate(String(data.contactEmail), vars);
      const customRaw = String(data.customFields ?? "");
      customRaw.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf("=");
        if (idx <= 0) return;
        const k = line.slice(0, idx).trim();
        const v = renderTemplate(line.slice(idx + 1).trim(), vars);
        if (k) nextVars[k] = v;
      });
      if (Object.keys(nextVars).length !== Object.keys(cv).length || Object.keys(nextVars).some((k) => nextVars[k] !== cv[k])) {
        patch.variables = nextVars;
      }
      if (Object.keys(patch).length) {
        await supabaseAdmin.from("contacts").update(patch).eq("id", run.contact_id);
      }
      await logStep("ok", undefined, { updated: Object.keys(patch) });
      await goNext();
      return;
    }

    if (node.type === "note") {
      const body = renderTemplate(String(data.note ?? ""), vars).trim();
      if (body) {
        const { data: conv } = await supabaseAdmin.from("crm_conversations")
          .select("id").eq("owner_user_id", run.user_id).eq("contact_phone", run.contact_phone).maybeSingle();
        if (conv?.id) {
          await supabaseAdmin.from("crm_notes").insert({
            conversation_id: conv.id, user_id: run.user_id, body, source: "flow",
          });
        }
      }
      await logStep("ok", undefined, { saved: !!body });
      await goNext();
      return;
    }

    if (node.type === "assign_agent") {
      const agentId = String(data.agentId ?? "").trim() || null;
      const status = String(data.conversationStatus ?? "open");
      const { error: convErr } = await supabaseAdmin.from("crm_conversations")
        .update({ assigned_agent_id: agentId, status, updated_at: new Date().toISOString() })
        .eq("owner_user_id", run.user_id)
        .eq("contact_phone", run.contact_phone);
      await logStep(convErr ? "error" : "ok", convErr?.message, { agentId, status });
      await goNext();
      return;
    }

    await logStep("ok");
    await goNext();

  } catch (e) {
    const msg = (e as Error).message;
    await logStep("error", msg);
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
    const reply = args.text ?? "";
    const newVars = { ...(r.variables ?? {}), [r.waiting_for]: reply };
    // Menu: roteia pelo número da opção (1..N) → handle "opt_N"; vazio/inválido → "invalid"
    let handle: string | undefined;
    if (node.type === "menu") {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const opts = String(data.menuOptions ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const digit = (reply.match(/\d+/)?.[0]) ?? "";
      const idx = digit ? Number(digit) : NaN;
      if (Number.isFinite(idx) && idx >= 1 && idx <= opts.length) {
        handle = `opt_${idx}`;
        newVars[`${r.waiting_for}_label`] = opts[idx - 1];
      } else {
        handle = "invalid";
      }
    }
    const edge = nextEdge(flow, node.id, handle);
    await supabaseAdmin.from("flow_runs").update({
      variables: newVars,
      waiting_for: null,
      wait_until: null,
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
  const lower = normalizeKeywordText(text);

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
    const kws = (t.keywords ?? []).map((k) => normalizeKeywordText(k)).filter(Boolean);
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
        node_id: "__trigger__", node_type: "trigger", status: "ok",
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

