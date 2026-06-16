import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const verifyContactsWhatsappFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { list_id: string; instance_id: string }) =>
    z.object({ list_id: z.string().uuid(), instance_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { checkWhatsappNumbers } = await import("@/lib/evolution.server");

    // valida lista
    const { data: list } = await supabase.from("contact_lists").select("id,user_id").eq("id", data.list_id).maybeSingle();
    if (!list || list.user_id !== userId) throw new Error("Lista não encontrada");

    // valida chip + servidor
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, status, user_id, evolution_servers(base_url, api_key)")
      .eq("id", data.instance_id)
      .maybeSingle();
    if (!inst || inst.user_id !== userId) throw new Error("Chip não encontrado");
    if (inst.status !== "connected") throw new Error("Chip não está conectado");
    const srv = inst.evolution_servers as { base_url: string; api_key: string } | null;
    if (!srv) throw new Error("Servidor da Evolution não configurado");

    // contatos
    const { data: contacts } = await supabase.from("contacts").select("id, phone").eq("list_id", data.list_id);
    if (!contacts?.length) return { checked: 0, valid: 0, removed: 0 };

    const invalidIds: string[] = [];
    const chunk = 50;
    let validCount = 0;

    for (let i = 0; i < contacts.length; i += chunk) {
      const slice = contacts.slice(i, i + chunk);
      const numbers = slice.map((c) => c.phone);
      const res = await checkWhatsappNumbers({ base_url: srv.base_url, api_key: srv.api_key }, inst.instance_name, numbers);
      // mapa por número (normaliza só dígitos)
      const map = new Map<string, boolean>();
      for (const r of res) {
        const onlyDigits = (r.number ?? "").replace(/\D/g, "");
        map.set(onlyDigits, !!r.exists);
      }
      for (const c of slice) {
        const key = c.phone.replace(/\D/g, "");
        const exists = map.get(key);
        if (exists === false) invalidIds.push(c.id);
        else if (exists === true) validCount++;
        else invalidIds.push(c.id); // sem resposta = considera inválido
      }
    }

    if (invalidIds.length) {
      const del = await supabase.from("contacts").delete().in("id", invalidIds);
      if (del.error) throw new Error(del.error.message);
      // atualiza contador
      const newTotal = contacts.length - invalidIds.length;
      await supabase.from("contact_lists").update({ total_count: newTotal }).eq("id", data.list_id);
    }

    return { checked: contacts.length, valid: validCount, removed: invalidIds.length };
  });
