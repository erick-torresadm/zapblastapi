import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Backfill em lote: percorre conversas com telefone @lid (15+ dígitos sem formato real)
 * ou sem nome/foto, tenta resolver e buscar perfil via Evolution.
 */
export const backfillCrmProfilesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; only_lid?: boolean }) => ({
    limit: Math.min(input?.limit ?? 30, 100),
    only_lid: input?.only_lid ?? true,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Busca conversas problemáticas (telefone com 15+ dígitos = @lid não resolvido OU sem nome)
    let q = supabase
      .from("crm_conversations")
      .select("id, contact_phone, contact_jid, contact_name, contact_avatar_url, instance_id")
      .eq("owner_user_id", userId)
      .limit(data.limit);

    if (data.only_lid) {
      // @lid normalmente são números muito grandes (15+ dígitos)
      q = q.or("contact_jid.ilike.%@lid,contact_name.is.null,contact_avatar_url.is.null");
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let resolved = 0;
    let profilesUpdated = 0;
    const errors: string[] = [];

    for (const conv of rows ?? []) {
      try {
        // 1. Resolver @lid se aplicável
        const isLid = conv.contact_jid?.endsWith("@lid") ||
          (conv.contact_phone && /^[0-9]{15,}$/.test(conv.contact_phone));

        if (isLid && conv.contact_jid) {
          const { data: realPhone } = await supabase.rpc("lookup_lid_phone", {
            p_user_id: userId,
            p_instance_id: conv.instance_id,
            p_lid_jid: conv.contact_jid,
          });
          if (realPhone && realPhone !== conv.contact_phone) {
            await supabase.from("crm_conversations")
              .update({ contact_phone: realPhone })
              .eq("id", conv.id);
            conv.contact_phone = realPhone;
            resolved++;
          }
        }

        // 2. Buscar perfil (nome + foto) se faltando
        if ((!conv.contact_name || !conv.contact_avatar_url) && conv.instance_id) {
          const { data: inst } = await supabase
            .from("whatsapp_instances")
            .select("instance_name, status, evolution_servers(base_url, api_key)")
            .eq("id", conv.instance_id)
            .single();

          if (inst && inst.status === "connected" && (inst as any).evolution_servers) {
            const server = (inst as any).evolution_servers;
            const { fetchProfile, fetchProfilePictureUrl } = await import("@/lib/evolution.server");
            const target = conv.contact_phone;
            const patch: Record<string, any> = {};

            try {
              const pic = await fetchProfilePictureUrl(server, inst.instance_name, target);
              const url = (pic as any)?.profilePictureUrl ?? (pic as any)?.value ?? null;
              if (url && !conv.contact_avatar_url) patch.contact_avatar_url = url;
            } catch {}

            try {
              const prof = await fetchProfile(server, inst.instance_name, target);
              const name = (prof as any)?.name ?? (prof as any)?.pushName ?? null;
              if (name && !conv.contact_name) patch.contact_name = name;
            } catch {}

            if (Object.keys(patch).length) {
              patch.profile_synced_at = new Date().toISOString();
              await supabase.from("crm_conversations").update(patch).eq("id", conv.id);

              // Salva também no cache crm_contacts_profile
              await supabase.from("crm_contacts_profile").upsert({
                owner_user_id: userId,
                instance_id: conv.instance_id,
                contact_phone: conv.contact_phone,
                push_name: patch.contact_name ?? undefined,
                profile_pic_url: patch.contact_avatar_url ?? undefined,
                profile_pic_fetched_at: new Date().toISOString(),
              }, { onConflict: "owner_user_id,contact_phone" });

              profilesUpdated++;
            }
          }
        }
      } catch (e: any) {
        errors.push(`${conv.id}: ${e.message}`);
      }
    }

    return { scanned: rows?.length ?? 0, lid_resolved: resolved, profiles_updated: profilesUpdated, errors };
  });
