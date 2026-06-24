// Helpers server-only para integração com Twenty CRM.
// NUNCA importar este arquivo de código de cliente — somente de *.functions.ts (dentro de handler) ou rotas /api/public/*.

export type TwentyConn = {
  user_id: string;
  base_url: string;
  api_key: string;
};

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") || digits.length > 11 ? `+${digits}` : `+55${digits}`;
}

export async function twentyFetch(
  conn: { base_url: string; api_key: string },
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const url = `${normalizeBase(conn.base_url)}/rest${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${conn.api_key}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any)?.messages?.[0] ?? (data as any)?.message ?? `HTTP ${r.status}`;
      return { ok: false, status: r.status, data, error: String(msg) };
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lê conexão (URL+key) do usuário. Usa supabaseAdmin + RPC twenty_get_api_key. */
export async function loadTwentyConn(userId: string): Promise<TwentyConn | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("twenty_connections")
    .select("user_id, base_url, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn || !conn.enabled) return null;
  const { data: apiKey } = await supabaseAdmin.rpc("twenty_get_api_key", { _user_id: userId });
  if (!apiKey) return null;
  return { user_id: userId, base_url: conn.base_url, api_key: apiKey as string };
}

/** Garante uma "person" no Twenty pra esse telefone (cache em twenty_contact_map). */
export async function ensureTwentyPerson(
  conn: TwentyConn,
  phone: string,
  fallbackName?: string | null,
): Promise<string | null> {
  const e164 = toE164(phone);
  if (!e164) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cached } = await supabaseAdmin
    .from("twenty_contact_map")
    .select("twenty_person_id")
    .eq("user_id", conn.user_id)
    .eq("phone_e164", e164)
    .maybeSingle();
  if (cached?.twenty_person_id) return cached.twenty_person_id;

  // procura por telefone primeiro
  const filter = encodeURIComponent(`phones.primaryPhoneNumber[eq]:${phone.replace(/\D/g, "")}`);
  const search = await twentyFetch(conn, `/people?filter=${filter}&limit=1`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let personId = (search.data as any)?.data?.people?.[0]?.id as string | undefined;

  if (!personId) {
    const first = (fallbackName ?? "").trim().split(/\s+/)[0] || "WhatsApp";
    const last = (fallbackName ?? "").trim().split(/\s+/).slice(1).join(" ");
    const create = await twentyFetch(conn, "/people", {
      method: "POST",
      body: JSON.stringify({
        name: { firstName: first, lastName: last || "" },
        phones: {
          primaryPhoneNumber: phone.replace(/\D/g, ""),
          primaryPhoneCountryCode: "BR",
          primaryPhoneCallingCode: "+55",
          additionalPhones: [],
        },
        jobTitle: "Lead ZapBlast",
      }),
    });
    if (!create.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    personId = (create.data as any)?.data?.createPerson?.id;
  }

  if (personId) {
    await supabaseAdmin.from("twenty_contact_map").upsert(
      { user_id: conn.user_id, phone_e164: e164, twenty_person_id: personId, synced_at: new Date().toISOString() },
      { onConflict: "user_id,phone_e164" },
    );
  }
  return personId ?? null;
}

/** Cria uma nota e atrela à pessoa. */
export async function postTwentyNote(
  conn: TwentyConn,
  personId: string,
  title: string,
  body: string,
): Promise<boolean> {
  const note = await twentyFetch(conn, "/notes", {
    method: "POST",
    body: JSON.stringify({ title: title.slice(0, 200), body: body.slice(0, 4000) }),
  });
  if (!note.ok) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noteId = (note.data as any)?.data?.createNote?.id;
  if (!noteId) return false;
  const target = await twentyFetch(conn, "/noteTargets", {
    method: "POST",
    body: JSON.stringify({ noteId, personId }),
  });
  return target.ok;
}
