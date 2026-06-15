import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Cria uma instância no servidor Evolution e grava no banco (vinculando ao usuário).
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
    const { data: server, error: serr } = await supabase.from("evolution_servers").select("*").eq("id", data.server_id).maybeSingle();
    if (serr || !server) throw new Error("Servidor não encontrado");

    const { createInstance } = await import("@/lib/evolution.server");
    const webhookUrl = `${process.env.SUPABASE_URL?.replace(".supabase.co", ".lovable.app") ?? ""}`;
    // Use stable lovable URL passed from caller if needed; for now omit webhook (set on connect)
    let result: Record<string, unknown>;
    try {
      result = await createInstance({ base_url: server.base_url, api_key: server.api_key }, data.instance_name);
    } catch (e) {
      throw new Error(`Falha ao criar no Evolution: ${(e as Error).message}`);
    }
    void webhookUrl;

    const { data: inst, error } = await supabase.from("whatsapp_instances").insert({
      user_id: userId,
      server_id: server.id,
      instance_name: data.instance_name,
      daily_limit: data.daily_limit ?? 200,
      status: "connecting",
    }).select().single();
    if (error) throw new Error(error.message);

    // QR code may be in result.qrcode.base64 or result.instance.qrcode
    const qrcode = (result?.qrcode as { base64?: string })?.base64
      ?? (result as { base64?: string })?.base64
      ?? null;
    return { instance: inst, qrcode };
  });

export const getInstanceQrFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*, evolution_servers(*)").eq("id", data.instance_id).maybeSingle();
    if (!inst || !inst.evolution_servers) throw new Error("Não encontrado");
    const srv = inst.evolution_servers as { base_url: string; api_key: string };
    const { connectInstance, instanceState } = await import("@/lib/evolution.server");
    const [qr, state] = await Promise.all([
      connectInstance({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name).catch(() => null),
      instanceState({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name).catch(() => null),
    ]);
    const stateVal = ((state as { instance?: { state?: string } } | null)?.instance?.state) ?? null;
    if (stateVal === "open") {
      await supabase.from("whatsapp_instances").update({ status: "connected" }).eq("id", inst.id);
    }
    const base64 = (qr as { base64?: string } | null)?.base64
      ?? ((qr as { qrcode?: { base64?: string } } | null)?.qrcode?.base64) ?? null;
    return { qrcode: base64, state: stateVal };
  });

export const deleteInstanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inst } = await supabase.from("whatsapp_instances").select("*, evolution_servers(*)").eq("id", data.instance_id).maybeSingle();
    if (!inst || !inst.evolution_servers) throw new Error("Não encontrado");
    const srv = inst.evolution_servers as { base_url: string; api_key: string };
    const { deleteInstance } = await import("@/lib/evolution.server");
    try { await deleteInstance({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name); } catch { /* já pode estar removido */ }
    await supabase.from("whatsapp_instances").delete().eq("id", inst.id);
    return { ok: true };
  });
