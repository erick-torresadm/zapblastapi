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
      .select("owner_user_id,contact_phone,contact_jid,chat_type,instance_id,assigned_agent_id")
      .eq("id", data.conversation_id).maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    const c = conv as any;

    // CRM só envia para conversas 1:1
    if (c.chat_type && c.chat_type !== "user") {
      throw new Error("Esta conversa não é um chat pessoal (1:1). Grupos e listas de transmissão não são suportados aqui.");
    }

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

    const server = { base_url: i.evolution_servers.base_url, api_key: i.evolution_servers.api_key };
    const { sendText, checkWhatsappNumbers } = await import("@/lib/evolution.server");

    // Usa JID completo se tivermos; senão tenta com o número.
    // Em ambos os casos a Evolution aceita 'number' como JID ou número puro.
    const target = c.contact_jid || c.contact_phone;

    // Validação: só telefones que existem no WhatsApp
    try {
      const check = await checkWhatsappNumbers(server, i.instance_name, [c.contact_phone]);
      const exists = check.find((r) => r.number === c.contact_phone || r.jid?.startsWith(c.contact_phone));
      if (exists && exists.exists === false) {
        throw new Error(`O número +${c.contact_phone} não está no WhatsApp.`);
      }
    } catch (e) {
      // se a validação falhar por motivo de rede, segue mesmo assim
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("O número")) throw e;
      console.warn("checkWhatsappNumbers falhou, tentando enviar mesmo assim:", msg);
    }

    let res: any;
    try {
      res = await sendText(server, i.instance_name, target, data.text);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Mensagens amigáveis para erros conhecidos
      if (raw.includes("exists\":false") || raw.includes("Bad Request")) {
        throw new Error(`O destinatário não está disponível no WhatsApp (${c.contact_phone}). Verifique se o número está correto.`);
      }
      if (raw.includes("not connected") || raw.includes("close")) {
        throw new Error("O chip está desconectado. Reconecte e tente novamente.");
      }
      throw new Error(raw.replace(/^Evolution API \d+: /, ""));
    }
    const msgId = (res as any)?.key?.id ?? null;

    await supabase.from("chat_messages" as any).insert({
      user_id: c.owner_user_id,
      instance_id: instanceId,
      contact_phone: c.contact_phone,
      contact_jid: c.contact_jid,
      chat_type: "user",
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
