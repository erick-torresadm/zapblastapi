// Server functions pra UI de Chatwoot (settings + iframe).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getChatwootConnectionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("chatwoot_connections")
      .select("chatwoot_account_id, chatwoot_user_id, email_used, enabled, replace_inbox, last_test_ok, last_test_at, last_test_error, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connection: data ?? null };
  });

export const provisionChatwootFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // já tem conexão?
    const { data: existing } = await context.supabase
      .from("chatwoot_connections")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("Conexão já existe. Desconecte antes de recriar.");

    // pega email do usuário Perseidas
    const { data: userData } = await context.supabase.auth.getUser();
    const userEmail = userData.user?.email;
    if (!userEmail) throw new Error("Sem email no perfil");

    const { provisionChatwootAccount, registerChatwootWebhook, loadChatwootConn } = await import("./chatwoot.server");

    // tenta com email do user; se conflito, fallback pra <user_id>@perseidas.local
    let attempt = await provisionChatwootAccount({ email: userEmail, name: userEmail.split("@")[0] });
    if (!attempt.ok && /email|exist|taken/i.test(attempt.error)) {
      const fallback = `${context.userId}@perseidas.local`;
      attempt = await provisionChatwootAccount({ email: fallback, name: fallback.split("@")[0] });
      if (!attempt.ok) throw new Error(`Provision falhou: ${attempt.error}`);
    } else if (!attempt.ok) {
      throw new Error(`Provision falhou: ${attempt.error}`);
    }

    const emailUsed = attempt.account_id && userEmail ? userEmail : `${context.userId}@perseidas.local`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin.from("chatwoot_connections").insert({
      user_id: context.userId,
      chatwoot_account_id: attempt.account_id,
      chatwoot_user_id: attempt.user_id,
      email_used: emailUsed,
      user_access_token_encrypted: attempt.access_token,
      enabled: true,
      replace_inbox: false,
    });
    if (insErr) throw new Error(insErr.message);

    // registra webhook
    const conn = await loadChatwootConn(context.userId);
    if (conn) {
      const publicBase = process.env.PUBLIC_APP_URL ?? "https://zapblastapi.lovable.app";
      await registerChatwootWebhook(conn, publicBase);
    }

    return { ok: true, account_id: attempt.account_id, email: emailUsed };
  });

export const testChatwootConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadChatwootConn, userFetch } = await import("./chatwoot.server");
    const conn = await loadChatwootConn(context.userId);
    if (!conn) return { ok: false as const, error: "sem conexão" };
    const r = await userFetch(conn.access_token, `/api/v1/accounts/${conn.account_id}/conversations?status=open&page=1`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("chatwoot_connections").update({
      last_test_ok: r.ok,
      last_test_at: new Date().toISOString(),
      last_test_error: r.ok ? null : r.error ?? `HTTP ${r.status}`,
    }).eq("user_id", context.userId);

    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? `HTTP ${r.status}` };
  });

export const setChatwootTogglesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const o = input as { enabled?: boolean; replace_inbox?: boolean };
    return { enabled: !!o.enabled, replace_inbox: !!o.replace_inbox };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("chatwoot_connections").update({
      enabled: data.enabled,
      replace_inbox: data.replace_inbox,
    }).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectChatwootFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // só remove o vínculo local. A conta no Chatwoot permanece (usuário pode reconectar gerando outra).
    const { error } = await context.supabase
      .from("chatwoot_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getChatwootSsoUrlFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadChatwootConn, getSsoLoginUrl } = await import("./chatwoot.server");
    const conn = await loadChatwootConn(context.userId);
    if (!conn) return { url: null as string | null };
    const url = await getSsoLoginUrl(conn);
    return { url };
  });
