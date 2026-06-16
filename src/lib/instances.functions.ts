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
function buildWebhookUrl(webhook_token: string) {
  const base = process.env.PUBLIC_APP_URL
    ?? process.env.APP_URL
    ?? process.env.LOVABLE_PUBLISHED_URL
    ?? "";
  if (!base) return undefined;
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
    const resolved = await resolveServer(data.server_id, supabase);
    if (!resolved) throw new Error("Servidor não encontrado");
    const { server } = resolved;

    const { createInstance } = await import("@/lib/evolution.server");
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

function asImageDataUrl(value: string, fromBase64Field = false) {
  const trimmed = value.trim();
  const embedded = trimmed.match(/data:image\/[a-zA-Z+.-]+;base64,([A-Za-z0-9+/=_-][A-Za-z0-9+/=\s_-]*)/);
  if (embedded) return `data:image/png;base64,${embedded[1].replace(/\s/g, "")}`;

  const raw = trimmed.replace(/^base64,?/i, "").replace(/\s/g, "");
  const looksLikeBase64 = raw.length > 80 && /^[A-Za-z0-9+/=_-]+$/.test(raw);
  if (fromBase64Field || looksLikeBase64) return `data:image/png;base64,${raw}`;
  return null;
}

function walkQrPayload(payload: unknown, visitor: (key: string, value: unknown) => string | null) {
  const seen = new Set<unknown>();
  const stack: Array<{ key: string; value: unknown }> = [{ key: "", value: payload }];
  while (stack.length) {
    const item = stack.shift()!;
    const found = visitor(item.key, item.value);
    if (found) return found;
    if (!item.value || typeof item.value !== "object" || seen.has(item.value)) continue;
    seen.add(item.value);
    Object.entries(item.value as Record<string, unknown>).forEach(([key, value]) => stack.push({ key, value }));
  }
  return null;
}

export async function normalizeQr(qr: unknown): Promise<string | null> {
  const base64 = walkQrPayload(qr, (key, value) => {
    if (typeof value !== "string") return null;
    return asImageDataUrl(value, key.toLowerCase().includes("base64"));
  });
  if (base64) return base64;

  const code = walkQrPayload(qr, (key, value) => {
    if (typeof value !== "string") return null;
    const k = key.toLowerCase();
    if (!["code", "qrcode", "qr", "qr_code", "pairingcode", "pairing_code"].includes(k)) return null;
    if (asImageDataUrl(value)) return null;
    return value.trim() || null;
  });
  if (!code) return null;
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(String(code), { width: 320, margin: 1 });
  } catch { return null; }
}

function extractEvolutionState(payload: unknown) {
  return walkQrPayload(payload, (key, value) => {
    if (key.toLowerCase() !== "state" || typeof value !== "string") return null;
    return value;
  });
}

// Diagnóstico sanitizado: só estrutura, sem base64.
function describePayload(p: unknown, depth = 0): string {
  if (p === null) return "null";
  if (typeof p !== "object") return typeof p;
  if (depth > 2) return "…";
  const obj = p as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 8);
  return `{ ${keys.map((k) => `${k}: ${describePayload(obj[k], depth + 1)}`).join(", ")} }`;
}

export const getInstanceQrFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { inst, srv } = await getInstanceWithServer(data.instance_id, supabase);
    const { connectInstance, instanceState } = await import("@/lib/evolution.server");

    let qr: Record<string, unknown> | null = null;
    let state: Record<string, unknown> | null = null;
    let lastError: string | null = null;

    try {
      qr = await connectInstance({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name);
    } catch (e) {
      lastError = (e as Error).message;
      console.warn(`[evolution] connect falhou para ${inst.instance_name}: ${lastError}`);
    }
    try {
      state = await instanceState({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name);
    } catch (e) {
      console.warn(`[evolution] connectionState falhou para ${inst.instance_name}: ${(e as Error).message}`);
    }

    const stateVal = extractEvolutionState(state) ?? extractEvolutionState(qr) ?? null;
    if (stateVal === "open") {
      await supabase.from("whatsapp_instances").update({ status: "connected", last_qr_base64: null, last_qr_error: null }).eq("id", inst.id);
      return { qrcode: null, state: stateVal, error: null, source: "connected" as const };
    }

    let base64 = await normalizeQr(qr);
    let source: "direct" | "stored" | "none" = "none";

    if (base64) {
      source = "direct";
      await supabase.from("whatsapp_instances").update({
        last_qr_base64: base64,
        last_qr_at: new Date().toISOString(),
        last_qr_error: null,
      }).eq("id", inst.id);
    } else {
      // Sem QR direto. Tenta o último QR salvo pelo webhook (válido por ~60s).
      console.warn(`[evolution] sem QR direto para ${inst.instance_name}. Resposta: ${describePayload(qr)}`);
      if (inst.last_qr_base64 && inst.last_qr_at) {
        const ageMs = Date.now() - new Date(inst.last_qr_at).getTime();
        if (ageMs < 55_000) {
          base64 = inst.last_qr_base64;
          source = "stored";
        }
      }
      if (!base64 && lastError) {
        await supabase.from("whatsapp_instances").update({ last_qr_error: lastError }).eq("id", inst.id);
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
