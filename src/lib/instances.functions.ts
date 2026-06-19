import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Resolve um servidor por ID: usa cliente do usuário (RLS) para próprios; admin para compartilhado.
async function resolveServer(serverId: string, userClient: any) {
  const { data: own } = await userClient.from("evolution_servers").select("*").eq("id", serverId).maybeSingle();
  if (own) return { server: own, isShared: own.is_shared as boolean };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: shared } = await supabaseAdmin.from("evolution_servers").select("*").eq("id", serverId).eq("is_shared", true).maybeSingle();
  if (!shared) return null;
  return { server: shared, isShared: true };
}

export const listAvailableServersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: own } = await supabase.from("evolution_servers").select("id,name,is_shared").eq("user_id", userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shared } = await supabaseAdmin.from("evolution_servers").select("id,name,is_shared").eq("is_shared", true);
    const map = new Map<string, { id: string; name: string; is_shared: boolean; is_own: boolean }>();
    (shared ?? []).forEach((s) => map.set(s.id, { id: s.id, name: s.name, is_shared: true, is_own: false }));
    (own ?? []).forEach((s) => map.set(s.id, { id: s.id, name: s.name, is_shared: s.is_shared, is_own: !s.is_shared }));
    return Array.from(map.values());
  });

// Monta a URL do webhook que vamos passar para a Evolution API.
// Prioriza env vars, mas tem fallback para a URL estável do projeto (sempre disponível
// no Cloudflare Workers do TanStack Start), pra não depender de configuração manual.
const STABLE_PROJECT_URL = "https://project--54478801-c0b5-4fb0-9ac8-01416bfad841.lovable.app";
function buildWebhookUrl(webhook_token: string) {
  const base = process.env.PUBLIC_APP_URL
    ?? process.env.APP_URL
    ?? process.env.LOVABLE_PUBLISHED_URL
    ?? STABLE_PROJECT_URL;
  return `${base.replace(/\/$/, "")}/api/public/evolution-webhook/${webhook_token}`;
}

export const createInstanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { server_id: string; instance_name: string; daily_limit?: number }) =>
    z.object({
      server_id: z.string().uuid(),
      instance_name: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Apenas letras, números, _ e -"),
      daily_limit: z.number().int().min(1).max(2000).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Enforcement de plano
    const { data: limits } = await supabase.rpc("get_user_plan_limits" as never, { _user_id: userId } as never);
    const l = limits as unknown as { can_act?: boolean; limits?: { max_chips: number }; usage?: { chips: number } } | null;
    if (!l?.can_act) throw new Error("Teste grátis expirado. Assine pra conectar novos chips.");
    if (l.limits && l.usage && l.limits.max_chips !== -1 && l.usage.chips >= l.limits.max_chips) {
      throw new Error(`Limite do seu plano: ${l.limits.max_chips} chip(s). Faça upgrade pra conectar mais.`);
    }

    const resolved = await resolveServer(data.server_id, supabase);
    if (!resolved) throw new Error("Servidor não encontrado");
    const { server } = resolved;

    const { createInstance } = await import("@/lib/evolution.server");
    const { normalizeQr } = await import("@/lib/evolution-qr.server");
    const webhookUrl = buildWebhookUrl(server.webhook_token);
    let result: Record<string, unknown>;
    try {
      result = await createInstance({ base_url: server.base_url, api_key: server.api_key }, data.instance_name, webhookUrl);
    } catch (e) {
      throw new Error(`Falha ao criar no Evolution: ${(e as Error).message}`);
    }

    const qrcode = await normalizeQr(result);

    const { data: inst, error } = await supabase.from("whatsapp_instances").insert({
      user_id: userId,
      server_id: server.id,
      instance_name: data.instance_name,
      daily_limit: data.daily_limit ?? 200,
      status: "connecting",
      last_qr_base64: qrcode,
      last_qr_at: qrcode ? new Date().toISOString() : null,
    }).select().single();
    if (error) throw new Error(error.message);

    return { instance: inst, qrcode };
  });

async function getInstanceWithServer(instanceId: string, userClient: any) {
  const { data: inst } = await userClient.from("whatsapp_instances").select("*").eq("id", instanceId).maybeSingle();
  if (!inst) throw new Error("Chip não encontrado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin.from("evolution_servers").select("base_url,api_key,is_shared,name,webhook_token").eq("id", inst.server_id).maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");
  return { inst, srv };
}

export const getInstanceQrFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string; force_restart?: boolean }) =>
    z.object({ instance_id: z.string().uuid(), force_restart: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { inst, srv } = await getInstanceWithServer(data.instance_id, supabase);
    const { connectInstance, instanceState, restartInstance, logoutInstance, createInstance, setWebhook } = await import("@/lib/evolution.server");
    const { normalizeQr, extractEvolutionState, describePayload } = await import("@/lib/evolution-qr.server");
    const evoServer = { base_url: srv.base_url, api_key: srv.api_key };
    const webhookUrl = buildWebhookUrl(srv.webhook_token);

    // Garante que o webhook está aplicado (instâncias antigas podem ter sido criadas sem ele).
    if (webhookUrl) {
      try { await setWebhook(evoServer, inst.instance_name, webhookUrl); }
      catch (e) { console.warn(`[evolution] setWebhook falhou: ${(e as Error).message}`); }
    }

    let qr: Record<string, unknown> | null = null;
    let state: Record<string, unknown> | null = null;
    let lastError: string | null = null;

    async function tryConnect() {
      try {
        qr = await connectInstance(evoServer, inst.instance_name);
      } catch (e) {
        lastError = (e as Error).message;
        console.warn(`[evolution] connect falhou para ${inst.instance_name}: ${lastError}`);
      }
    }

    // Se o painel pediu reset manual, derruba a sessão antes.
    if (data.force_restart) {
      try { await logoutInstance(evoServer, inst.instance_name); } catch { /* ignore */ }
      try { await restartInstance(evoServer, inst.instance_name); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 1500));
    }

    await tryConnect();

    // Instância sumiu na Evolution → recria automaticamente e tenta de novo.
    if (lastError && /does not exist|404/i.test(lastError)) {
      console.warn(`[evolution] instância ${inst.instance_name} não existe, recriando…`);
      try {
        const created = await createInstance(evoServer, inst.instance_name, webhookUrl);
        qr = created;
        lastError = null;
      } catch (e) {
        lastError = `Falha ao recriar instância: ${(e as Error).message}`;
        console.warn(`[evolution] ${lastError}`);
      }
    }

    try {
      state = await instanceState(evoServer, inst.instance_name);
    } catch (e) {
      console.warn(`[evolution] connectionState falhou para ${inst.instance_name}: ${(e as Error).message}`);
    }

    let base64 = await normalizeQr(qr);

    // Workaround bug Evolution #2385: connect devolve { count: N } sem QR quando a instância
    // está presa em loop de reconexão. Restart força o Baileys a gerar um novo QR.
    if (!base64 && qr && typeof qr === "object" && "count" in qr && Object.keys(qr).length <= 2) {
      console.warn(`[evolution] connect retornou shape {count} para ${inst.instance_name}, tentando restart`);
      try {
        await restartInstance(evoServer, inst.instance_name);
        await new Promise((r) => setTimeout(r, 1500));
        await tryConnect();
        base64 = await normalizeQr(qr);
      } catch (e) {
        console.warn(`[evolution] restart falhou: ${(e as Error).message}`);
      }
    }

    const stateVal = extractEvolutionState(state) ?? extractEvolutionState(qr) ?? null;
    if (stateVal === "open") {
      await supabase.from("whatsapp_instances").update({ status: "connected", last_qr_base64: null, last_qr_error: null }).eq("id", inst.id);
      return { qrcode: null, state: stateVal, error: null, source: "connected" as const };
    }

    let source: "direct" | "stored" | "none" | "connected" = "none";

    if (base64) {
      source = "direct";
      await supabase.from("whatsapp_instances").update({
        last_qr_base64: base64,
        last_qr_at: new Date().toISOString(),
        last_qr_error: null,
      }).eq("id", inst.id);
    } else {
      console.warn(`[evolution] sem QR para ${inst.instance_name}. Resposta: ${describePayload(qr)} | state: ${describePayload(state)}`);
      if (inst.last_qr_base64 && inst.last_qr_at) {
        const ageMs = Date.now() - new Date(inst.last_qr_at).getTime();
        if (ageMs < 55_000) {
          base64 = inst.last_qr_base64;
          source = "stored";
        }
      }
      if (!base64) {
        const looksLikeServerBug = qr && typeof qr === "object" && "count" in qr && Object.keys(qr).length <= 2;
        const msg = looksLikeServerBug
          ? "Evolution não está gerando QR. No docker do servidor, ajuste: QRCODE_LIMIT=30, CONFIG_SESSION_PHONE_CLIENT=Chrome, CONFIG_SESSION_PHONE_VERSION=2.3000.1030831524 — depois reinicie o container."
          : (lastError ?? "Evolution não devolveu QR. Apague esse chip e crie de novo.");
        await supabase.from("whatsapp_instances").update({ last_qr_error: msg }).eq("id", inst.id);
        lastError = msg;
      }
    }

    return {
      qrcode: base64,
      state: stateVal,
      error: base64 ? null : (lastError ?? inst.last_qr_error ?? null),
      source,
    };
  });



export const deleteInstanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { inst, srv } = await getInstanceWithServer(data.instance_id, supabase);
    const { deleteInstance } = await import("@/lib/evolution.server");
    try { await deleteInstance({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name); } catch { /* já removido */ }
    await supabase.from("whatsapp_instances").delete().eq("id", inst.id);
    return { ok: true };
  });

// Lista chips do usuário com nome do servidor (resolvido server-side, sem expor URL/key).
export const listInstancesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: insts } = await supabase.from("whatsapp_instances").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (!insts?.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(insts.map((i) => i.server_id)));
    const { data: servers } = await supabaseAdmin.from("evolution_servers").select("id,name,is_shared").in("id", ids);
    const map = new Map((servers ?? []).map((s) => [s.id, s]));
    return insts.map((i) => {
      const s = map.get(i.server_id);
      return { ...i, server_name: s?.name ?? "—", server_is_shared: s?.is_shared ?? false };
    });
  });
