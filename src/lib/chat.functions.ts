// Mensagens e envio para o CRM. As conversas vivem em crm_conversations.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getConversationMessagesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: conv } = await supabase.from("crm_conversations" as any)
      .select("owner_user_id,contact_phone").eq("id", data.conversation_id).maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    const c = conv as any;
    const { data: msgs } = await supabase
      .from("chat_messages" as any)
      .select("id,direction,text,created_at,status,read_at,instance_id,sent_by_agent_id")
      .eq("user_id", c.owner_user_id)
      .eq("contact_phone", c.contact_phone)
      .order("created_at", { ascending: true })
      .limit(500);
    // zera unread
    await supabase.from("crm_conversations" as any)
      .update({ unread_count: 0 }).eq("id", data.conversation_id);
    return msgs ?? [];
  });

export const sendChatMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    text: z.string().min(1).max(4000),
    instance_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase.from("crm_conversations" as any)
      .select("owner_user_id,contact_phone,instance_id,assigned_agent_id")
      .eq("id", data.conversation_id).maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    const c = conv as any;

    // Auto-atribui ao agente que respondeu (se estiver sem dono)
    if (!c.assigned_agent_id) {
      await supabase.from("crm_conversations" as any)
        .update({ assigned_agent_id: userId })
        .eq("id", data.conversation_id);
    }

    const instanceId = data.instance_id ?? c.instance_id;
    if (!instanceId) throw new Error("Selecione um chip para enviar");

    const { data: inst } = await supabase
      .from("whatsapp_instances" as any)
      .select("id,instance_name,status,user_id,evolution_servers(base_url,api_key)")
      .eq("id", instanceId).maybeSingle();
    const i = inst as any;
    if (!i) throw new Error("Chip não encontrado");
    if (i.user_id !== c.owner_user_id) throw new Error("Chip não pertence a esta workspace");
    if (i.status !== "connected") throw new Error("Chip não está conectado");

    const { sendText } = await import("@/lib/evolution.server");
    const res = await sendText(
      { base_url: i.evolution_servers.base_url, api_key: i.evolution_servers.api_key },
      i.instance_name, c.contact_phone, data.text,
    );
    const msgId = (res as any)?.key?.id ?? null;

    await supabase.from("chat_messages" as any).insert({
      user_id: c.owner_user_id,
      instance_id: instanceId,
      contact_phone: c.contact_phone,
      direction: "out",
      text: data.text,
      evolution_message_id: msgId,
      status: "sent",
      sent_by_agent_id: userId,
    });
    return { ok: true };
  });

export const listChatInstancesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspace_owner: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const owner = data.workspace_owner ?? context.userId;
    const { data: rows } = await context.supabase.from("whatsapp_instances" as any)
      .select("id,instance_name,status,user_id").eq("user_id", owner)
      .order("instance_name");
    return rows ?? [];
  });
