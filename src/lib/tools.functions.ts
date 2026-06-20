// Pay-per-use WhatsApp utility tools (number validator + group extractor).
// Each call debits the user's wallet. Prices in cents.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const TOOL_PRICES = {
  validator_per_number_cents: 2,    // R$ 0,02
  group_extract_per_contact_cents: 10, // R$ 0,10
  group_extract_min_charge_cents: 100,  // cobra ao menos R$ 1,00 mesmo se grupo for minúsculo
  maps_search_flat_cents: 500,      // R$ 5,00 por busca (até 60 leads)
  maps_search_max_leads: 60,
  maps_whatsapp_check_per_lead_cents: 2, // toggle opcional: valida cada lead no WhatsApp
} as const;


export const getToolsPricingFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => TOOL_PRICES);

async function resolveServerByInstance(userClient: any, instanceId: string, userId: string) {
  const { data: inst } = await userClient
    .from("whatsapp_instances")
    .select("*")
    .eq("id", instanceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!inst) throw new Error("Chip não encontrado");
  if (inst.status !== "connected" && inst.status !== "open") {
    throw new Error("Chip precisa estar conectado para usar esta ferramenta");
  }
  // resolve server (own or shared)
  const { data: own } = await userClient.from("evolution_servers").select("*").eq("id", inst.server_id).maybeSingle();
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

async function getBalance(userClient: any, userId: string): Promise<number> {
  const { data } = await userClient.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle();
  return Number(data?.balance_cents ?? 0);
}

// ===========================================================================
// 1) Number validator (bulk)
// ===========================================================================

export const validateNumbersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string; numbers: string[] }) =>
    z.object({
      instance_id: z.string().uuid(),
      numbers: z.array(z.string().min(8).max(20)).min(1).max(5000),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { server, instance } = await resolveServerByInstance(supabase, data.instance_id, userId);

    // Normalize and dedupe
    const cleaned = Array.from(new Set(
      data.numbers
        .map((n) => String(n).replace(/\D/g, ""))
        .filter((n) => n.length >= 8 && n.length <= 15),
    ));
    if (cleaned.length === 0) throw new Error("Nenhum número válido na lista");

    const cost = cleaned.length * TOOL_PRICES.validator_per_number_cents;
    const balance = await getBalance(supabase, userId);
    if (balance < cost) {
      throw new Error(`Saldo insuficiente. Necessário R$ ${(cost / 100).toFixed(2)}, disponível R$ ${(balance / 100).toFixed(2)}. Adicione saldo na Carteira.`);
    }

    // Debit upfront
    const { error: debitErr } = await supabase.rpc("debit_wallet" as never, {
      _amount_cents: cost,
      _description: `Validador WhatsApp: ${cleaned.length} número(s)`,
    } as never);
    if (debitErr) throw new Error(`Falha ao debitar saldo: ${debitErr.message}`);

    // Call Evolution in chunks of 50
    const { checkWhatsappNumbers } = await import("@/lib/evolution.server");
    const valid: Array<{ number: string; jid: string }> = [];
    const invalid: string[] = [];
    try {
      for (let i = 0; i < cleaned.length; i += 50) {
        const chunk = cleaned.slice(i, i + 50);
        const result = await checkWhatsappNumbers(server, instance.instance_name, chunk);
        const byNum = new Map(result.map((r) => [String(r.number).replace(/\D/g, ""), r]));
        for (const n of chunk) {
          const r = byNum.get(n);
          if (r?.exists) valid.push({ number: n, jid: r.jid || `${n}@s.whatsapp.net` });
          else invalid.push(n);
        }
      }
    } catch (e) {
      // Refund on API failure
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("credit_wallet" as never, {
        _user_id: userId,
        _amount_cents: cost,
        _type: "refund",
        _description: `Reembolso: validador falhou (${(e as Error).message.slice(0, 80)})`,
      } as never);
      throw new Error(`Falha na validação: ${(e as Error).message}. Saldo reembolsado.`);
    }

    return {
      total: cleaned.length,
      valid_count: valid.length,
      invalid_count: invalid.length,
      cost_cents: cost,
      valid,
      invalid,
    };
  });

// ===========================================================================
// 2) Group participant extractor
// ===========================================================================

export const extractGroupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string; group: string }) =>
    z.object({
      instance_id: z.string().uuid(),
      group: z.string().min(5).max(500),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { server, instance } = await resolveServerByInstance(supabase, data.instance_id, userId);

    const evo = await import("@/lib/evolution.server");
    const raw = data.group.trim();

    // Step 1: resolve to group info (invite link OR group JID)
    let info: Awaited<ReturnType<typeof evo.findGroupInfos>> | null = null;
    let groupJid: string | null = null;

    const inviteCode = evo.parseGroupInviteCode(raw);
    if (inviteCode) {
      try {
        const inv = await evo.inviteInfoGroup(server, instance.instance_name, inviteCode);
        info = inv;
        groupJid = (inv?.id as string) || null;
      } catch (e) {
        throw new Error(`Não consegui ler esse convite: ${(e as Error).message}`);
      }
    } else if (raw.includes("@g.us")) {
      groupJid = raw;
    } else if (/^\d{8,}-\d{8,}$/.test(raw)) {
      groupJid = `${raw}@g.us`;
    } else {
      throw new Error("Cole um link de convite (https://chat.whatsapp.com/...) ou o JID do grupo");
    }

    // Step 2: ensure we have participants — try findGroupInfos if instance is member
    let participants: Array<{ id: string; admin?: string | null }> =
      (info?.participants as Array<{ id: string; admin?: string | null }>) || [];
    if (participants.length === 0 && groupJid) {
      try {
        const full = await evo.findGroupInfos(server, instance.instance_name, groupJid);
        info = full;
        participants = (full?.participants as Array<{ id: string; admin?: string | null }>) || [];
      } catch {
        // ignored
      }
    }

    if (participants.length === 0) {
      throw new Error("Não foi possível listar os membros. O chip precisa estar dentro do grupo para extrair os contatos.");
    }

    // Step 3: separate participants by JID type and try to resolve @lid → real phone
    type Pending = { jid: string; admin: boolean; phone: string | null; isLid: boolean };
    const pending: Pending[] = participants.map((p) => {
      const jid = String(p.id);
      const isLid = jid.endsWith("@lid");
      const phone = isLid ? null : (jid.split("@")[0] || "").replace(/\D/g, "") || null;
      return { jid, admin: !!p.admin, phone, isLid };
    });

    const lidJids = pending.filter((c) => c.isLid && !c.phone).map((c) => c.jid);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 3a) Try cache (crm_lid_map) for known mappings
    if (lidJids.length > 0) {
      const { data: cached } = await supabaseAdmin
        .from("crm_lid_map")
        .select("lid_jid, phone")
        .eq("owner_user_id", userId)
        .in("lid_jid", lidJids);
      const cacheMap = new Map<string, string>(
        ((cached ?? []) as Array<{ lid_jid: string; phone: string }>).map((r) => [r.lid_jid, r.phone]),
      );
      for (const c of pending) {
        if (c.isLid && !c.phone && cacheMap.has(c.jid)) c.phone = cacheMap.get(c.jid)!;
      }
    }

    // 3b) For still-unresolved @lid, ask Evolution for chat mappings and populate cache
    const stillUnresolved = pending.filter((c) => c.isLid && !c.phone).map((c) => c.jid);
    if (stillUnresolved.length > 0) {
      try {
        const chats = await evo.findChats(server, instance.instance_name);
        const liveMap = new Map<string, string>();
        for (const chat of chats) {
          const rj = String((chat as { remoteJid?: string; id?: string }).remoteJid ?? (chat as { id?: string }).id ?? "");
          const alt = String((chat as { remoteJidAlt?: string | null }).remoteJidAlt ?? "");
          const realA = rj.match(/^(\d{8,15})@(s\.whatsapp\.net|c\.us)$/);
          const lidA = alt.match(/^\d+@lid$/);
          if (realA && lidA) liveMap.set(alt, realA[1]);
          const lidB = rj.match(/^\d+@lid$/);
          const realB = alt.match(/^(\d{8,15})@(s\.whatsapp\.net|c\.us)$/);
          if (lidB && realB) liveMap.set(rj, realB[1]);
        }
        const newRows: Array<{ owner_user_id: string; instance_id: string; lid_jid: string; phone: string }> = [];
        for (const c of pending) {
          if (c.isLid && !c.phone && liveMap.has(c.jid)) {
            c.phone = liveMap.get(c.jid)!;
            newRows.push({
              owner_user_id: userId,
              instance_id: data.instance_id,
              lid_jid: c.jid,
              phone: c.phone,
            });
          }
        }
        if (newRows.length > 0) {
          await supabaseAdmin
            .from("crm_lid_map")
            .upsert(newRows, { onConflict: "owner_user_id,lid_jid" });
        }
      } catch (e) {
        console.warn("[extractGroupFn] findChats lookup failed:", (e as Error).message);
      }
    }

    // Step 4: charge ONLY for participants where we extracted a real phone.
    const resolved = pending.filter((c) => !!c.phone);
    const unresolved = pending.filter((c) => !c.phone);

    if (resolved.length === 0) {
      throw new Error(
        `Nenhum telefone foi extraído. O grupo tem ${participants.length} membro(s), ` +
        `mas todos estão com privacidade ativada (identificadores @lid). ` +
        `Para liberar os números: abra algumas conversas do grupo neste chip e aguarde o WhatsApp sincronizar, ` +
        `ou use um chip que já tenha histórico com esses membros. Nenhum valor foi cobrado.`,
      );
    }

    const baseCost = resolved.length * TOOL_PRICES.group_extract_per_contact_cents;
    const cost = Math.max(baseCost, TOOL_PRICES.group_extract_min_charge_cents);
    const balance = await getBalance(supabase, userId);
    if (balance < cost) {
      throw new Error(
        `Conseguimos extrair ${resolved.length} telefone(s). Custo: R$ ${(cost / 100).toFixed(2)}. ` +
        `Saldo: R$ ${(balance / 100).toFixed(2)}. Adicione saldo na Carteira para concluir.`,
      );
    }
    const { error: debitErr } = await supabase.rpc("debit_wallet" as never, {
      _amount_cents: cost,
      _description: `Extrator de grupo: ${resolved.length} contato(s) — ${info?.subject ?? groupJid}`,
    } as never);
    if (debitErr) throw new Error(`Falha ao debitar saldo: ${debitErr.message}`);

    // Step 5: shape output — resolved first, unresolved kept for transparency.
    const contacts = [
      ...resolved.map((c) => ({
        jid: c.jid,
        phone: c.phone,
        is_admin: c.admin,
        is_privacy_hidden: c.isLid,
      })),
      ...unresolved.map((c) => ({
        jid: c.jid,
        phone: null,
        is_admin: c.admin,
        is_privacy_hidden: true,
      })),
    ];

    return {
      group: {
        id: groupJid,
        subject: (info?.subject as string) ?? null,
        size: (info?.size as number) ?? participants.length,
      },
      cost_cents: cost,
      total: contacts.length,
      resolved_count: resolved.length,
      unresolved_count: unresolved.length,
      contacts,
    };
  });
