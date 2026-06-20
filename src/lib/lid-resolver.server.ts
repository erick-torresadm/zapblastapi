// Resolve um @lid (Linked ID da Evolution/Baileys) para um telefone real
// usando, em ordem: campos do próprio payload e histórico já registrado
// no banco. Mantém-se server-only.

type AnyRec = Record<string, unknown>;

function digits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function isRealPhone(v: unknown): v is string {
  const d = digits(v);
  return d.length >= 8 && d.length <= 14;
}

function pickPhone(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue;
    const raw = String(c);
    const user = raw.includes("@") ? raw.split("@")[0] : raw;
    const d = digits(user);
    if (d.length >= 8 && d.length <= 14) return d;
  }
  return null;
}

/**
 * Tenta extrair o telefone real do payload de messages.upsert.
 * Cobre as variantes conhecidas da Evolution 2.3.x/2.4.x e do Baileys.
 */
export function extractPhoneFromPayload(payload: AnyRec): string | null {
  const data = (payload?.data ?? payload) as AnyRec;
  const key = (data?.key ?? {}) as AnyRec;

  // 1) remoteJid já é @s.whatsapp.net ou remoteJidAlt é
  const remoteJid = String(key.remoteJid ?? "");
  const remoteJidAlt = String(key.remoteJidAlt ?? "");

  if (remoteJid.endsWith("@s.whatsapp.net")) {
    const p = pickPhone(remoteJid);
    if (p) return p;
  }
  if (remoteJidAlt.endsWith("@s.whatsapp.net")) {
    const p = pickPhone(remoteJidAlt);
    if (p) return p;
  }

  // 2) campos *Pn / pn em níveis variados
  const candidates: unknown[] = [
    key.senderPn, key.participantPn, key.pn,
    (data as AnyRec).senderPn, (data as AnyRec).participantPn, (data as AnyRec).pn,
    (data as AnyRec).senderTimestampPn,
  ];
  const ci = data?.contextInfo as AnyRec | undefined;
  if (ci) candidates.push(ci.participant, ci.remoteJid);
  return pickPhone(...candidates);
}

/**
 * Consulta o histórico para mapear um @lid → telefone real.
 * Usa a função SQL `public.lookup_lid_phone` que junta:
 *   a) mensagens onde remoteJidAlt == lid e remoteJid é @s.whatsapp.net
 *   b) mensagens com remoteJid == lid e from_phone já resolvido
 *   c) chat_messages com contact_jid == lid e contact_phone real
 */
export async function resolveLidFromHistory(
  supabaseAdmin: { rpc: (fn: string, args: AnyRec) => Promise<{ data: unknown; error: unknown }> },
  args: { user_id: string; instance_id: string | null; lid_jid: string },
): Promise<{ phone: string; jid: string } | null> {
  const lid = args.lid_jid;
  if (!lid || !lid.endsWith("@lid")) return null;
  try {
    const { data, error } = await supabaseAdmin.rpc("lookup_lid_phone", {
      p_user_id: args.user_id,
      p_instance_id: args.instance_id,
      p_lid_jid: lid,
    });
    if (error) {
      console.warn("[lid] lookup_lid_phone error", error);
      return null;
    }
    const phone = pickPhone(data);
    if (!phone) return null;
    return { phone, jid: `${phone}@s.whatsapp.net` };
  } catch (e) {
    console.warn("[lid] lookup_lid_phone exception", (e as Error).message);
    return null;
  }
}

