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
 *
 * Estratégias (em ordem):
 *   a) já existe uma mensagem onde remoteJidAlt == lidJid e remoteJid é
 *      @s.whatsapp.net (cenário: mesmo contato escreveu antes com nono
 *      dígito); usamos o telefone daquele remoteJid.
 *   b) já existe uma mensagem onde remoteJid == lidJid e from_phone é um
 *      telefone válido (foi resolvido por outro caminho na época).
 *   c) já existe um chat_messages com contact_jid @s.whatsapp.net cujo
 *      payload tem o mesmo @lid em qualquer campo conhecido.
 */
export async function resolveLidFromHistory(
  supabaseAdmin: { from: (t: string) => any },
  args: { user_id: string; instance_id: string | null; lid_jid: string },
): Promise<{ phone: string; jid: string; source: "alt" | "from_phone" | "chat_jid" } | null> {
  const lid = args.lid_jid;
  if (!lid || !lid.endsWith("@lid")) return null;

  // (a) remoteJidAlt == lid → remoteJid traz o número real
  try {
    const q = supabaseAdmin.from("incoming_messages")
      .select("from_phone, raw_payload")
      .eq("user_id", args.user_id)
      .filter("raw_payload->data->key->>remoteJidAlt", "eq", lid)
      .order("received_at", { ascending: false })
      .limit(5);
    if (args.instance_id) q.eq("instance_id", args.instance_id);
    const { data } = await q;
    for (const row of (data ?? []) as Array<{ from_phone: string | null; raw_payload: AnyRec }>) {
      const remote = String(((row.raw_payload?.data as AnyRec | undefined)?.key as AnyRec | undefined)?.remoteJid ?? "");
      if (remote.endsWith("@s.whatsapp.net")) {
        const p = pickPhone(remote);
        if (p) return { phone: p, jid: `${p}@s.whatsapp.net`, source: "alt" };
      }
      if (isRealPhone(row.from_phone)) {
        const p = pickPhone(row.from_phone);
        if (p) return { phone: p, jid: `${p}@s.whatsapp.net`, source: "from_phone" };
      }
    }
  } catch { /* ignore */ }

  // (b) remoteJid == lid + from_phone real (foi resolvido antes via Pn)
  try {
    const q = supabaseAdmin.from("incoming_messages")
      .select("from_phone")
      .eq("user_id", args.user_id)
      .filter("raw_payload->data->key->>remoteJid", "eq", lid)
      .order("received_at", { ascending: false })
      .limit(5);
    if (args.instance_id) q.eq("instance_id", args.instance_id);
    const { data } = await q;
    for (const row of (data ?? []) as Array<{ from_phone: string | null }>) {
      if (isRealPhone(row.from_phone)) {
        const p = pickPhone(row.from_phone);
        if (p) return { phone: p, jid: `${p}@s.whatsapp.net`, source: "from_phone" };
      }
    }
  } catch { /* ignore */ }

  // (c) chat_messages com mesmo @lid no JID e algum telefone associado
  try {
    const { data } = await supabaseAdmin.from("chat_messages")
      .select("contact_jid, contact_phone")
      .eq("user_id", args.user_id)
      .eq("contact_jid", lid)
      .not("contact_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of (data ?? []) as Array<{ contact_phone: string | null }>) {
      if (isRealPhone(row.contact_phone)) {
        const p = pickPhone(row.contact_phone);
        if (p) return { phone: p, jid: `${p}@s.whatsapp.net`, source: "chat_jid" };
      }
    }
  } catch { /* ignore */ }

  return null;
}
