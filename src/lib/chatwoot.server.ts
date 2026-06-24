// Helpers server-only para Chatwoot.
// NUNCA importar de código cliente — só de *.functions.ts (dentro do handler) ou /api/public/*.

export type ChatwootConn = {
  user_id: string;
  account_id: number;
  chatwoot_user_id: number;
  access_token: string;
  email_used: string;
  webhook_secret: string;
};

function baseUrl() {
  const u = process.env.CHATWOOT_BASE_URL;
  if (!u) throw new Error("CHATWOOT_BASE_URL não configurado");
  return u.replace(/\/+$/, "");
}

function platformToken() {
  const t = process.env.CHATWOOT_PLATFORM_TOKEN;
  if (!t) throw new Error("CHATWOOT_PLATFORM_TOKEN não configurado");
  return t;
}

export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") || digits.length > 11 ? `+${digits}` : `+55${digits}`;
}

type CwResult = { ok: boolean; status: number; data: unknown; error?: string };

async function cwFetch(token: string, path: string, init?: RequestInit): Promise<CwResult> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        api_access_token: token,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (data as any)?.message ?? (data as any)?.errors?.[0] ?? `HTTP ${r.status}`;
      return { ok: false, status: r.status, data, error: String(msg) };
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function platformFetch(path: string, init?: RequestInit) {
  return cwFetch(platformToken(), path, init);
}
export function userFetch(userToken: string, path: string, init?: RequestInit) {
  return cwFetch(userToken, path, init);
}

/** Lê conexão completa do usuário. */
export async function loadChatwootConn(userId: string): Promise<ChatwootConn | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("chatwoot_connections")
    .select("user_id, chatwoot_account_id, chatwoot_user_id, email_used, user_access_token_encrypted, webhook_secret, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    user_id: data.user_id,
    account_id: data.chatwoot_account_id,
    chatwoot_user_id: data.chatwoot_user_id,
    access_token: data.user_access_token_encrypted,
    email_used: data.email_used,
    webhook_secret: data.webhook_secret,
  };
}

/** Cria conta + usuário Chatwoot via Platform API. Retorna access_token do user. */
export async function provisionChatwootAccount(opts: {
  email: string;
  name: string;
}): Promise<{ ok: true; account_id: number; user_id: number; access_token: string } | { ok: false; error: string }> {
  // 1) cria account
  const acc = await platformFetch("/platform/api/v1/accounts", {
    method: "POST",
    body: JSON.stringify({ name: opts.name.slice(0, 100) }),
  });
  if (!acc.ok) return { ok: false, error: `account: ${acc.error}` };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountId = (acc.data as any)?.id as number | undefined;
  if (!accountId) return { ok: false, error: "account criada mas sem id" };

  // 2) cria user
  const password = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
  const usr = await platformFetch("/platform/api/v1/users", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      email: opts.email,
      password,
    }),
  });
  if (!usr.ok) return { ok: false, error: `user: ${usr.error}` };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (usr.data as any)?.id as number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = (usr.data as any)?.access_token as string | undefined;
  if (!userId || !accessToken) return { ok: false, error: "user criado mas sem id/token" };

  // 3) liga user à account como administrator
  const link = await platformFetch(`/platform/api/v1/accounts/${accountId}/account_users`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role: "administrator" }),
  });
  if (!link.ok) return { ok: false, error: `link: ${link.error}` };

  return { ok: true, account_id: accountId, user_id: userId, access_token: accessToken };
}

/** Cria webhook na conta apontando pro endpoint público. */
export async function registerChatwootWebhook(conn: ChatwootConn, publicBaseUrl: string): Promise<boolean> {
  const url = `${publicBaseUrl.replace(/\/+$/, "")}/api/public/chatwoot-webhook?secret=${conn.webhook_secret}`;
  const r = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/webhooks`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        url,
        subscriptions: ["message_created", "message_updated"],
      },
    }),
  });
  return r.ok;
}

/** Gera URL SSO temporária pro iframe (não expõe access_token no browser). */
export async function getSsoLoginUrl(conn: ChatwootConn): Promise<string | null> {
  const r = await platformFetch(`/platform/api/v1/users/${conn.chatwoot_user_id}/login`);
  if (!r.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((r.data as any)?.url as string | undefined) ?? null;
}

/** Garante inbox tipo API pra uma instância WhatsApp. */
export async function ensureInbox(conn: ChatwootConn, instanceId: string, instanceName: string): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("chatwoot_inbox_map")
    .select("chatwoot_inbox_id")
    .eq("user_id", conn.user_id)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (cached?.chatwoot_inbox_id) return cached.chatwoot_inbox_id;

  const r = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/inboxes`, {
    method: "POST",
    body: JSON.stringify({
      name: `WhatsApp - ${instanceName}`.slice(0, 80),
      channel: { type: "api", webhook_url: "" },
    }),
  });
  if (!r.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = (r.data as any)?.id as number | undefined;
  if (!id) return null;
  await supabaseAdmin.from("chatwoot_inbox_map").insert({
    user_id: conn.user_id,
    instance_id: instanceId,
    chatwoot_inbox_id: id,
  });
  return id;
}

/** Garante contact + conversation no Chatwoot. */
export async function ensureContactAndConversation(
  conn: ChatwootConn,
  inboxId: number,
  phone: string,
  fallbackName?: string | null,
): Promise<{ contact_id: number; conversation_id: number } | null> {
  const e164 = toE164(phone);
  if (!e164) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cached } = await supabaseAdmin
    .from("chatwoot_contact_map")
    .select("chatwoot_contact_id, chatwoot_conversation_id")
    .eq("user_id", conn.user_id)
    .eq("phone_e164", e164)
    .maybeSingle();

  let contactId = cached?.chatwoot_contact_id ?? null;
  let convId = cached?.chatwoot_conversation_id ?? null;

  if (!contactId) {
    // cria contact (source_id = phone p/ dedup futuro)
    const r = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        name: fallbackName?.trim() || phone,
        phone_number: e164,
        inbox_id: inboxId,
        identifier: e164,
      }),
    });
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contactId = (r.data as any)?.payload?.contact?.id ?? (r.data as any)?.id ?? null;
    } else if (r.status === 422 || r.status === 409) {
      // já existe — busca pelo identifier
      const s = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/contacts/search?q=${encodeURIComponent(e164)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contactId = (s.data as any)?.payload?.[0]?.id ?? null;
    }
  }
  if (!contactId) return null;

  if (!convId) {
    // tenta achar conversa aberta existente
    const list = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/contacts/${contactId}/conversations`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = (list.data as any)?.payload?.find?.((c: any) => c.inbox_id === inboxId && c.status !== "resolved");
    convId = existing?.id ?? null;

    if (!convId) {
      // cria conversa nova — precisa de contact_inbox source_id
      // 1) cria contact_inbox
      const ci = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/contacts/${contactId}/contact_inboxes`, {
        method: "POST",
        body: JSON.stringify({ inbox_id: inboxId, source_id: e164 }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceId = (ci.data as any)?.source_id ?? e164;

      const c = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/conversations`, {
        method: "POST",
        body: JSON.stringify({
          source_id: sourceId,
          inbox_id: inboxId,
          contact_id: contactId,
          status: "open",
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      convId = (c.data as any)?.id ?? null;
    }
  }
  if (!convId) return null;

  await supabaseAdmin.from("chatwoot_contact_map").upsert(
    { user_id: conn.user_id, phone_e164: e164, chatwoot_contact_id: contactId, chatwoot_conversation_id: convId, updated_at: new Date().toISOString() },
    { onConflict: "user_id,phone_e164" },
  );
  return { contact_id: contactId, conversation_id: convId };
}

/** Posta mensagem numa conversa. */
export async function postChatwootMessage(
  conn: ChatwootConn,
  conversationId: number,
  content: string,
  direction: "in" | "out",
  sourceId?: string,
): Promise<boolean> {
  const r = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: content.slice(0, 4000),
      message_type: direction === "in" ? "incoming" : "outgoing",
      private: false,
      source_id: sourceId ? `perseidas:${sourceId}` : undefined,
    }),
  });
  return r.ok;
}
