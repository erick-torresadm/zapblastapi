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

// Lista servidores disponíveis para o usuário (próprios + compartilhados), SEM expor URL/api_key.
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
    let result: Record<string, unknown>;
    try {
      result = await createInstance({ base_url: server.base_url, api_key: server.api_key }, data.instance_name);
    } catch (e) {
      throw new Error(`Falha ao criar no Evolution: ${(e as Error).message}`);
    }

    const { data: inst, error } = await supabase.from("whatsapp_instances").insert({
      user_id: userId,
      server_id: server.id,
      instance_name: data.instance_name,
      daily_limit: data.daily_limit ?? 200,
      status: "connecting",
    }).select().single();
    if (error) throw new Error(error.message);

    const qrcode = await normalizeQr(result);
    return { instance: inst, qrcode };
  });

async function getInstanceWithServer(instanceId: string, userClient: any) {
  const { data: inst } = await userClient.from("whatsapp_instances").select("*").eq("id", instanceId).maybeSingle();
  if (!inst) throw new Error("Chip não encontrado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin.from("evolution_servers").select("base_url,api_key,is_shared,name").eq("id", inst.server_id).maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");
  return { inst, srv };
}

async function normalizeQr(qr: unknown): Promise<string | null> {
  if (!qr || typeof qr !== "object") return null;
  const r = qr as Record<string, any>;
  // tentativas em ordem: r.base64 → r.qrcode.base64 → r.qrcode (string) → r.code → r.qrcode.code
  const base64 = r.base64 ?? r.qrcode?.base64 ?? null;
  if (base64) return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  const code = typeof r.qrcode === "string" ? r.qrcode : (r.code ?? r.qrcode?.code ?? null);
  if (!code) return null;
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(String(code), { width: 320, margin: 1 });
  } catch { return null; }
}

export const getInstanceQrFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { inst, srv } = await getInstanceWithServer(data.instance_id, supabase);
    const { connectInstance, instanceState } = await import("@/lib/evolution.server");
    const [qr, state] = await Promise.all([
      connectInstance({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name).catch(() => null),
      instanceState({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name).catch(() => null),
    ]);
    const stateVal = ((state as { instance?: { state?: string } } | null)?.instance?.state) ?? null;
    if (stateVal === "open") {
      await supabase.from("whatsapp_instances").update({ status: "connected" }).eq("id", inst.id);
    }
    const base64 = await normalizeQr(qr);
    return { qrcode: base64, state: stateVal };
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
