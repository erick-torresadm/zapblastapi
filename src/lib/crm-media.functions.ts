// CRM: mídia, perfil do contato, respostas rápidas, presença.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Helpers ----------
async function loadConversation(supabase: any, id: string) {
  const { data } = await supabase.from("crm_conversations")
    .select("id,owner_user_id,instance_id,contact_phone,contact_jid,contact_name,contact_avatar_url,contact_about,contact_email,contact_company,tags,custom_fields,presence,presence_at,profile_synced_at")
    .eq("id", id).maybeSingle();
  if (!data) throw new Error("Conversa não encontrada");
  return data;
}

async function loadInstanceWithServer(supabase: any, instanceId: string) {
  const { data } = await supabase.from("whatsapp_instances")
    .select("id,instance_name,status,user_id,evolution_servers(base_url,api_key)")
    .eq("id", instanceId).maybeSingle();
  if (!data) throw new Error("Chip não encontrado");
  return data as any;
}

async function signMediaUrl(supabase: any, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Já é URL completa? devolve.
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data } = await supabase.storage.from("crm-media").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

// ---------- Envio de mídia ----------
export const sendChatMediaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    storage_path: z.string().min(3),
    kind: z.enum(["image", "video", "audio", "document", "sticker"]),
    mime: z.string().optional(),
    filename: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
    caption: z.string().max(2000).optional(),
    duration_seconds: z.number().int().nonnegative().optional(),
    is_ptt: z.boolean().optional(),
    instance_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conv = await loadConversation(supabase, data.conversation_id) as any;

    if (!conv.assigned_agent_id) {
      await supabase.from("crm_conversations")
        .update({ assigned_agent_id: userId }).eq("id", conv.id);
    }

    const instanceId = data.instance_id ?? conv.instance_id;
    if (!instanceId) throw new Error("Selecione um chip para enviar");
    const inst = await loadInstanceWithServer(supabase, instanceId);
    if (inst.user_id !== conv.owner_user_id) throw new Error("Chip não pertence a esta workspace");
    if (inst.status !== "connected") throw new Error("Chip não está conectado");

    // Gera URL assinada (24h) para a Evolution baixar.
    const { data: signed } = await supabase.storage.from("crm-media")
      .createSignedUrl(data.storage_path, 60 * 60 * 24);
    if (!signed?.signedUrl) throw new Error("Falha ao gerar URL da mídia");

    const server = { base_url: inst.evolution_servers.base_url, api_key: inst.evolution_servers.api_key };
    const target = conv.contact_jid || conv.contact_phone;

    const { sendMedia, sendWhatsAppAudio, sendSticker } = await import("@/lib/evolution.server");
    let res: any;
    try {
      if (data.kind === "sticker") {
        res = await sendSticker(server, inst.instance_name, target, signed.signedUrl);
      } else if (data.kind === "audio" && data.is_ptt) {
        res = await sendWhatsAppAudio(server, inst.instance_name, target, signed.signedUrl);
      } else {
        res = await sendMedia(server, inst.instance_name, target, {
          mediatype: data.kind as any,
          media: signed.signedUrl,
          caption: data.caption,
          fileName: data.filename,
          mimetype: data.mime,
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      throw new Error(raw.replace(/^Evolution API \d+: /, ""));
    }
    const msgId = res?.key?.id ?? null;

    await supabase.from("chat_messages").insert({
      user_id: conv.owner_user_id,
      instance_id: instanceId,
      contact_phone: conv.contact_phone,
      contact_jid: conv.contact_jid,
      chat_type: "user",
      direction: "out",
      text: null,
      caption: data.caption ?? null,
      evolution_message_id: msgId,
      status: "sent",
      sent_by_agent_id: userId,
      media_type: data.kind,
      media_url: data.storage_path,
      media_mime: data.mime ?? null,
      media_filename: data.filename ?? null,
      media_size: data.size ?? null,
      duration_seconds: data.duration_seconds ?? null,
      is_ptt: data.is_ptt ?? false,
    });
    return { ok: true };
  });

// ---------- Resolve URLs assinadas para uma lista de mensagens ----------
export const signMediaUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paths: z.array(z.string()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const out: Record<string, string> = {};
    for (const p of data.paths) {
      if (!p) continue;
      if (p.startsWith("http")) { out[p] = p; continue; }
      const { data: s } = await context.supabase.storage.from("crm-media")
        .createSignedUrl(p, 60 * 60 * 24);
      if (s?.signedUrl) out[p] = s.signedUrl;
    }
    return out;
  });

// ---------- Perfil do contato ----------
export const fetchContactProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const conv = await loadConversation(supabase, data.conversation_id) as any;
    if (!conv.instance_id) throw new Error("Conversa sem chip associado");
    const inst = await loadInstanceWithServer(supabase, conv.instance_id);
    if (inst.status !== "connected") throw new Error("Chip desconectado");

    const server = { base_url: inst.evolution_servers.base_url, api_key: inst.evolution_servers.api_key };
    const target = conv.contact_jid || conv.contact_phone;
    const { fetchProfile, fetchProfilePictureUrl } = await import("@/lib/evolution.server");

    const patch: Record<string, unknown> = { profile_synced_at: new Date().toISOString() };

    try {
      const pic = await fetchProfilePictureUrl(server, inst.instance_name, target);
      const url = (pic as any)?.profilePictureUrl ?? (pic as any)?.value ?? null;
      if (url) patch.contact_avatar_url = url;
    } catch (e) { console.warn("avatar fail", e); }

    try {
      const prof = await fetchProfile(server, inst.instance_name, target);
      const name = (prof as any)?.name ?? (prof as any)?.pushName ?? null;
      const about = (prof as any)?.status?.status ?? (prof as any)?.status ?? null;
      if (name && !conv.contact_name) patch.contact_name = name;
      if (about) patch.contact_about = typeof about === "string" ? about : null;
    } catch (e) { console.warn("profile fail", e); }

    await supabase.from("crm_conversations").update(patch).eq("id", conv.id);
    return { ok: true, ...patch };
  });

export const updateContactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    contact_name: z.string().max(120).optional(),
    contact_email: z.string().email().max(255).optional().or(z.literal("")),
    contact_company: z.string().max(160).optional(),
    tags: z.array(z.string().min(1).max(40)).optional(),
    custom_fields: z.record(z.string(), z.string().max(500)).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.contact_name !== undefined) patch.contact_name = data.contact_name;
    if (data.contact_email !== undefined) patch.contact_email = data.contact_email || null;
    if (data.contact_company !== undefined) patch.contact_company = data.contact_company;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.custom_fields !== undefined) patch.custom_fields = data.custom_fields;
    const { error } = await context.supabase.from("crm_conversations")
      .update(patch).eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Presença ----------
export const sendPresenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    presence: z.enum(["composing", "recording", "paused"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conv = await loadConversation(context.supabase, data.conversation_id) as any;
    if (!conv.instance_id) return { ok: false };
    const inst = await loadInstanceWithServer(context.supabase, conv.instance_id);
    if (inst.status !== "connected") return { ok: false };
    const server = { base_url: inst.evolution_servers.base_url, api_key: inst.evolution_servers.api_key };
    const target = conv.contact_jid || conv.contact_phone;
    const { sendPresence } = await import("@/lib/evolution.server");
    try { await sendPresence(server, inst.instance_name, target, data.presence, 2500); } catch {}
    return { ok: true };
  });

// ---------- Respostas rápidas ----------
export const listQuickRepliesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspace: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const owner = data.workspace ?? context.userId;
    const { data: rows } = await context.supabase.from("crm_quick_replies")
      .select("id,shortcut,title,text,created_at")
      .eq("owner_user_id", owner)
      .order("shortcut");
    return rows ?? [];
  });

export const saveQuickReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    workspace: z.string().uuid().optional(),
    shortcut: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_\-]+$/, "Use letras, números, _ ou -"),
    title: z.string().max(120).optional(),
    text: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const owner = data.workspace ?? context.userId;
    if (data.id) {
      const { error } = await context.supabase.from("crm_quick_replies")
        .update({ shortcut: data.shortcut, title: data.title ?? null, text: data.text })
        .eq("id", data.id).eq("owner_user_id", owner);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("crm_quick_replies")
        .insert({ owner_user_id: owner, shortcut: data.shortcut, title: data.title ?? null, text: data.text, created_by: context.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteQuickReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_quick_replies")
      .delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
