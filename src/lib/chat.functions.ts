// CRM / Inbox WhatsApp Web style. Server functions para listar conversas,
// mensagens e enviar texto.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listConversationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Pega as últimas 500 mensagens e agrega por contact_phone no JS
    const { data: msgs } = await supabase
      .from("chat_messages" as any)
      .select("contact_phone,direction,text,created_at,read_at,instance_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    const map = new Map<string, {
      phone: string; last_text: string | null; last_at: string;
      last_direction: "in" | "out"; unread: number; instance_id: string | null;
    }>();
    for (const m of (msgs ?? []) as any[]) {
      const ex = map.get(m.contact_phone);
      if (!ex) {
        map.set(m.contact_phone, {
          phone: m.contact_phone,
          last_text: m.text,
          last_at: m.created_at,
          last_direction: m.direction,
          unread: m.direction === "in" && !m.read_at ? 1 : 0,
          instance_id: m.instance_id,
        });
      } else if (m.direction === "in" && !m.read_at) {
        ex.unread += 1;
      }
    }
    const convs = Array.from(map.values());
    const phones = convs.map((c) => c.phone);
    let contactsMap: Record<string, { name: string | null }> = {};
    if (phones.length) {
      const { data: cs } = await supabase.from("contacts" as any)
        .select("phone,name").eq("user_id", userId).in("phone", phones);
      contactsMap = Object.fromEntries((cs ?? []).map((c: any) => [c.phone, { name: c.name }]));
    }
    return convs.map((c) => ({ ...c, name: contactsMap[c.phone]?.name ?? null }));
  });

export const getConversationMessagesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs } = await supabase
      .from("chat_messages" as any)
      .select("id,direction,text,created_at,status,read_at,instance_id")
      .eq("user_id", userId)
      .eq("contact_phone", data.phone)
      .order("created_at", { ascending: true })
      .limit(300);
    // marca como lidas
    await supabase.from("chat_messages" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId).eq("contact_phone", data.phone)
      .eq("direction", "in").is("read_at", null);
    return msgs ?? [];
  });

export const sendChatMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    phone: z.string().min(3),
    text: z.string().min(1).max(4000),
    instance_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inst } = await supabase
      .from("whatsapp_instances" as any)
      .select("id,instance_name,status,user_id,evolution_servers(base_url,api_key)")
      .eq("id", data.instance_id).maybeSingle();
    const i = inst as any;
    if (!i || i.user_id !== userId) throw new Error("Chip não encontrado");
    if (i.status !== "connected") throw new Error("Chip não está conectado");

    const { sendText } = await import("@/lib/evolution.server");
    const res = await sendText(
      { base_url: i.evolution_servers.base_url, api_key: i.evolution_servers.api_key },
      i.instance_name, data.phone, data.text,
    );
    const msgId = (res as any)?.key?.id ?? null;

    await supabase.from("chat_messages" as any).insert({
      user_id: userId,
      instance_id: data.instance_id,
      contact_phone: data.phone,
      direction: "out",
      text: data.text,
      evolution_message_id: msgId,
      status: "sent",
    });
    return { ok: true };
  });

export const listChatInstancesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("whatsapp_instances" as any)
      .select("id,instance_name,status").eq("user_id", context.userId)
      .order("instance_name");
    return data ?? [];
  });
