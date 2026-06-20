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
          const { data: realPhone } = await (supabase as any).rpc("lookup_lid_phone", {
            p_user_id: userId,
            p_instance_id: conv.instance_id ?? null,
            p_lid_jid: conv.contact_jid,
          });
          if (realPhone && realPhone !== conv.contact_phone) {
            await (supabase.from("crm_conversations") as any)
              .update({ contact_phone: realPhone })
              .eq("id", conv.id);
            conv.contact_phone = realPhone as unknown as string;
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
              await (supabase.from("crm_conversations") as any).update(patch).eq("id", conv.id);

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

/**
 * Sincroniza contatos + mapeamento @lid → telefone diretamente da Evolution API.
 * Resolve as conversas presas em "Identificando…".
 */
export const syncInstanceContactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance_id: string }) => ({
    instance_id: String(input.instance_id),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inst, error: instErr } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, status, user_id, evolution_servers(base_url, api_key)")
      .eq("id", data.instance_id)
      .single();

    if (instErr || !inst) throw new Error("Instância não encontrada");

    const ownerId = (inst as any).user_id as string;
    const { data: isMember } = await (supabase as any).rpc("crm_is_workspace_member", {
      _owner: ownerId,
    });
    if (!isMember) throw new Error("Sem acesso a esta instância");

    const server = (inst as any).evolution_servers;
    if (!server) throw new Error("Servidor Evolution não configurado");
    if ((inst as any).status !== "connected") {
      throw new Error("Instância desconectada — reconecte o WhatsApp e tente de novo");
    }

    const { findChats, findContacts } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    void userId;
    let lidMapped = 0;
    let profilesCached = 0;
    let chatsScanned = 0;

    // 1) findChats → mapeamento @lid ↔ telefone real
    try {
      const chats = await findChats(server, inst.instance_name);
      chatsScanned = chats.length;
      for (const chat of chats) {
        const rj = (chat.remoteJid ?? chat.id ?? "") as string;
        const alt = (chat.remoteJidAlt ?? "") as string;

        // Caso A: remoteJid é número real, remoteJidAlt é @lid
        const mReal = rj.match(/^(\d{8,14})@(s\.whatsapp\.net|c\.us)$/);
        const mLid = alt.match(/^\d+@lid$/);
        if (mReal && mLid) {
          await supabaseAdmin.rpc("crm_upsert_lid_map", {
            p_owner: ownerId,
            p_instance: data.instance_id,
            p_lid: alt,
            p_phone: mReal[1],
          });
          lidMapped++;
          continue;
        }

        // Caso B: o contrário — remoteJid é @lid e alt é o número real
        const mLid2 = rj.match(/^\d+@lid$/);
        const mReal2 = alt.match(/^(\d{8,14})@(s\.whatsapp\.net|c\.us)$/);
        if (mLid2 && mReal2) {
          await supabaseAdmin.rpc("crm_upsert_lid_map", {
            p_owner: ownerId,
            p_instance: data.instance_id,
            p_lid: rj,
            p_phone: mReal2[1],
          });
          lidMapped++;
        }
      }
    } catch (e) {
      console.warn("[syncInstanceContactsFn] findChats falhou:", (e as Error).message);
    }

    // 2) findContacts → nome + foto
    try {
      const contacts = await findContacts(server, inst.instance_name);
      for (const c of contacts) {
        const idStr = String((c as any).id ?? (c as any).remoteJid ?? "");
        const phoneMatch = idStr.match(/^(\d{8,14})@/);
        if (!phoneMatch) continue;
        const phone = phoneMatch[1];
        const pushName = ((c as any).pushName ?? (c as any).name ?? null) as string | null;
        const picUrl = ((c as any).profilePicUrl ?? (c as any).profilePictureUrl ?? null) as string | null;
        if (!pushName && !picUrl) continue;

        await supabaseAdmin
          .from("crm_contacts_profile")
          .upsert(
            {
              owner_user_id: ownerId,
              instance_id: data.instance_id,
              contact_phone: phone,
              push_name: pushName ?? undefined,
              profile_pic_url: picUrl ?? undefined,
              profile_pic_fetched_at: picUrl ? new Date().toISOString() : undefined,
            },
            { onConflict: "owner_user_id,contact_phone" },
          );
        profilesCached++;
      }
    } catch (e) {
      console.warn("[syncInstanceContactsFn] findContacts falhou:", (e as Error).message);
    }

    // 3) Aplica resolução nas conversas pendentes
    const { data: applied } = await supabaseAdmin.rpc("crm_apply_lid_resolution", {
      p_owner: ownerId,
    });

    // 4) Preenche nome/foto faltantes nas conversas a partir do cache
    const { data: needProfile } = await supabaseAdmin
      .from("crm_conversations")
      .select("id, contact_phone")
      .eq("owner_user_id", ownerId)
      .or("contact_name.is.null,contact_avatar_url.is.null")
      .limit(500);

    let convsUpdated = 0;
    for (const conv of needProfile ?? []) {
      const { data: prof } = await supabaseAdmin
        .from("crm_contacts_profile")
        .select("push_name, profile_pic_url")
        .eq("owner_user_id", ownerId)
        .eq("contact_phone", (conv as any).contact_phone ?? "")
        .maybeSingle();
      if (!prof) continue;
      const patch: Record<string, any> = {};
      if ((prof as any).push_name) patch.contact_name = (prof as any).push_name;
      if ((prof as any).profile_pic_url) patch.contact_avatar_url = (prof as any).profile_pic_url;
      if (Object.keys(patch).length) {
        patch.profile_synced_at = new Date().toISOString();
        await supabaseAdmin.from("crm_conversations").update(patch).eq("id", (conv as any).id);
        convsUpdated++;
      }
    }

    return {
      chats_scanned: chatsScanned,
      lid_mapped: lidMapped,
      profiles_cached: profilesCached,
      conversations_resolved: (applied as any)?.resolved ?? 0,
      conversations_merged: (applied as any)?.merged ?? 0,
      conversations_profile_updated: convsUpdated,
    };
  });
