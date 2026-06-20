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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  args: { user_id: string; instance_id: string | null; lid_jid: string },
): Promise<{ phone: string; jid: string } | null> {
  const lid = args.lid_jid;
  if (!lid || !lid.endsWith("@lid")) return null;

  // Estratégia 1: alguma mensagem anterior chegou com este @lid em remoteJidAlt
  // e o remoteJid era @s.whatsapp.net (o número real). É o caso ouro.
  try {
    let q = supabaseAdmin
      .from("incoming_messages")
      .select("raw_payload, received_at")
      .eq("user_id", args.user_id)
      .eq("raw_payload->data->key->>remoteJidAlt", lid)
      .like("raw_payload->data->key->>remoteJid", "%@s.whatsapp.net")
      .order("received_at", { ascending: false })
      .limit(1);
    if (args.instance_id) q = q.eq("instance_id", args.instance_id);
    const { data, error } = await q;
    console.log("[lid] history strat1", { lid, count: data?.length, error: error?.message });
    if (data && data.length > 0) {
      const rj = data[0]?.raw_payload?.data?.key?.remoteJid;
      const phone = pickPhone(rj);
      if (phone) return { phone, jid: `${phone}@s.whatsapp.net` };
    }
  } catch (e) {
    console.warn("[lid] history strat1 exception", (e as Error).message);
  }

  // Estratégia 2: chat_messages com contact_jid==@lid e contact_phone real (não-LID).
  try {
    const { data, error } = await supabaseAdmin
      .from("chat_messages")
      .select("contact_phone")
      .eq("user_id", args.user_id)
      .eq("contact_jid", `${lid.split("@")[0]}@s.whatsapp.net`)
      .limit(1);
    console.log("[lid] history strat2", { lid, count: data?.length, error: error?.message });
    if (data && data.length > 0 && isRealPhone(data[0].contact_phone)) {
      const phone = pickPhone(data[0].contact_phone);
      if (phone && !phone.startsWith(lid.split("@")[0])) {
        return { phone, jid: `${phone}@s.whatsapp.net` };
      }
    }
  // Estratégia 3 (fallback robusto): varre as últimas 500 mensagens da instância
  // e procura em memória por uma com remoteJidAlt == lid.
  try {
    let q = supabaseAdmin
      .from("incoming_messages")
      .select("raw_payload, received_at")
      .eq("user_id", args.user_id)
      .order("received_at", { ascending: false })
      .limit(500);
    if (args.instance_id) q = q.eq("instance_id", args.instance_id);
    const { data, error } = await q;
    console.log("[lid] history strat3 scan", { lid, count: data?.length, error: error?.message });
    if (data) {
      for (const row of data) {
        const k = row?.raw_payload?.data?.key ?? {};
        const rja = String(k.remoteJidAlt ?? "");
        const rj = String(k.remoteJid ?? "");
        if (rja === lid && rj.endsWith("@s.whatsapp.net")) {
          const phone = pickPhone(rj);
          if (phone) {
            console.log("[lid] strat3 match", { lid, phone });
            return { phone, jid: `${phone}@s.whatsapp.net` };
          }
        }
      }
    }
  } catch (e) {
    console.warn("[lid] history strat3 exception", (e as Error).message);
  }

  return null;
}

