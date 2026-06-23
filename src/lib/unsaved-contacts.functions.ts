// Identifica contatos que conversaram com o cliente mas NÃO estão salvos
// na agenda do telefone dele. Disponível em todos os planos.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";



async function resolveServerByInstance(supabase: any, instanceId: string, userId: string) {
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!inst) throw new Error("Chip não encontrado");
  if (inst.status !== "connected" && inst.status !== "open") {
    throw new Error("Chip precisa estar conectado");
  }
  const { data: own } = await supabase.from("evolution_servers").select("*").eq("id", inst.server_id).maybeSingle();
  if (own) return { server: own, instance: inst };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: shared } = await supabaseAdmin
    .from("evolution_servers")
    .select("*")
    .eq("id", inst.server_id)
    .eq("is_shared", true)
    .maybeSingle();
  if (!shared) throw new Error("Servidor não encontrado");
  return { server: shared, instance: inst };
}

export type UnsavedContact = {
  jid: string;
  phone: string | null;
  push_name: string | null;
  profile_pic: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  message_count: number;
};

export const listUnsavedContactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) =>
    z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { server, instance } = await resolveServerByInstance(supabase, data.instance_id, userId);

    // 1. Fetch all contacts the chip knows about
    const { findContacts } = await import("@/lib/evolution.server");
    let allContacts: Awaited<ReturnType<typeof findContacts>> = [];
    try {
      allContacts = await findContacts(server, instance.instance_name);
    } catch (e) {
      throw new Error(`Não consegui ler contatos: ${(e as Error).message}`);
    }

    // 2. Heuristic: "unsaved" = no `name` field OR name equals pushName/phone
    const unsaved: UnsavedContact[] = [];
    for (const c of allContacts) {
      const jid = String(c.id ?? c.remoteJid ?? "");
      if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid") || jid.endsWith("@broadcast")) continue;
      const phone = jid.split("@")[0].replace(/\D/g, "");
      if (!phone || phone.length < 8) continue;

      const savedName = (c.name ?? "").trim();
      const pushName = (c.pushName ?? "").trim();

      const isSaved = savedName.length > 0
        && savedName !== pushName
        && savedName.replace(/\D/g, "") !== phone;

      if (isSaved) continue;

      unsaved.push({
        jid,
        phone,
        push_name: pushName || null,
        profile_pic: c.profilePicUrl ?? null,
        last_message_at: null,
        last_message_text: null,
        message_count: 0,
      });
    }

    // 3. Cross-reference with crm_conversations for last-message + message_count
    const phones = unsaved.map((u) => u.phone).filter(Boolean) as string[];
    if (phones.length > 0) {
      const { data: convs } = await supabase
        .from("crm_conversations")
        .select("contact_phone, last_message_at, last_message_text")
        .eq("owner_user_id", userId)
        .in("contact_phone", phones.slice(0, 1000));
      const byPhone = new Map<string, { last_message_at: string | null; last_message_text: string | null }>();
      for (const c of convs ?? []) {
        byPhone.set(String((c as any).contact_phone), {
          last_message_at: (c as any).last_message_at ?? null,
          last_message_text: (c as any).last_message_text ?? null,
        });
      }
      for (const u of unsaved) {
        const conv = u.phone ? byPhone.get(u.phone) : null;
        if (conv) {
          u.last_message_at = conv.last_message_at;
          u.last_message_text = conv.last_message_text;
        }
      }
    }

    // 4. Sort: ones with conversation first, then by recency
    unsaved.sort((a, b) => {
      if (a.last_message_at && !b.last_message_at) return -1;
      if (!a.last_message_at && b.last_message_at) return 1;
      if (a.last_message_at && b.last_message_at) {
        return b.last_message_at.localeCompare(a.last_message_at);
      }
      return 0;
    });

    // 5. Sempre liberado (disponível em todos os planos)
    return {
      total: unsaved.length,
      with_conversation: unsaved.filter((u) => u.last_message_at).length,
      can_export: true,
      plan: null,
      contacts: unsaved,
    };
  });


/** Gera vCard (.vcf) com todos os contatos não salvos. Disponível em todos os planos. */
export const exportUnsavedAsVcardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) =>
    z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;


    const { server, instance } = await resolveServerByInstance(supabase, data.instance_id, userId);
    const { findContacts } = await import("@/lib/evolution.server");
    const all = await findContacts(server, instance.instance_name);

    const lines: string[] = [];
    let count = 0;
    for (const c of all) {
      const jid = String(c.id ?? c.remoteJid ?? "");
      if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid") || jid.endsWith("@broadcast")) continue;
      const phone = jid.split("@")[0].replace(/\D/g, "");
      if (!phone || phone.length < 8) continue;
      const savedName = (c.name ?? "").trim();
      const pushName = (c.pushName ?? "").trim();
      const isSaved = savedName.length > 0
        && savedName !== pushName
        && savedName.replace(/\D/g, "") !== phone;
      if (isSaved) continue;

      const displayName = pushName || `WhatsApp +${phone}`;
      lines.push("BEGIN:VCARD");
      lines.push("VERSION:3.0");
      lines.push(`FN:${displayName}`);
      lines.push(`N:${displayName};;;;`);
      lines.push(`TEL;TYPE=CELL;waid=${phone}:+${phone}`);
      lines.push("END:VCARD");
      count++;
    }

    return { vcard: lines.join("\r\n"), count };
  });
