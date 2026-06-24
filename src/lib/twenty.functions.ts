// Server functions para a tela de configuração e widgets do Twenty CRM.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getTwentyConnectionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("twenty_connections")
      .select("base_url, workspace_id, enabled, replace_inbox, last_test_at, last_test_ok, last_test_error, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connection: data ?? null };
  });

const saveSchema = z.object({
  base_url: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL inválida"),
  api_key: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  enabled: z.boolean(),
  replace_inbox: z.boolean(),
});

export const saveTwentyConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    // testa a conexão antes de salvar (se veio key ou se já existe key salva)
    const { twentyFetch, loadTwentyConn } = await import("./twenty.server");
    let testKey = data.api_key ?? "";
    if (!testKey) {
      const existing = await loadTwentyConn(context.userId);
      testKey = existing?.api_key ?? "";
    }
    let testOk = false;
    let testErr: string | null = null;
    if (testKey) {
      const r = await twentyFetch({ base_url: data.base_url, api_key: testKey }, "/people?limit=1");
      testOk = r.ok;
      testErr = r.ok ? null : r.error ?? `HTTP ${r.status}`;
    } else {
      throw new Error("API key obrigatória na primeira conexão");
    }

    const { error } = await context.supabase.rpc("twenty_save_connection", {
      _base_url: data.base_url,
      _api_key: data.api_key ?? "",
      _workspace_id: data.workspace_id ?? null,
      _enabled: data.enabled && testOk,
      _replace_inbox: data.replace_inbox,
    });
    if (error) throw new Error(error.message);

    await context.supabase
      .from("twenty_connections")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: testOk, last_test_error: testErr })
      .eq("user_id", context.userId);

    return { ok: testOk, error: testErr };
  });

export const testTwentyConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTwentyConn, twentyFetch } = await import("./twenty.server");
    const conn = await loadTwentyConn(context.userId);
    if (!conn) return { ok: false, error: "Nenhuma conexão salva" };
    const r = await twentyFetch(conn, "/people?limit=1");
    await context.supabase
      .from("twenty_connections")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: r.ok, last_test_error: r.ok ? null : (r.error ?? `HTTP ${r.status}`) })
      .eq("user_id", context.userId);
    return { ok: r.ok, error: r.ok ? null : (r.error ?? `HTTP ${r.status}`) };
  });

export const disconnectTwentyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("twenty_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const getTwentyDealsCachedFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: conn } = await context.supabase
      .from("twenty_connections")
      .select("enabled, base_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conn?.enabled) return { enabled: false, base_url: null as string | null, deals: [] as Array<{ id: string; name: string | null; amount_micros: number | null; currency: string | null; stage: string | null; close_date: string | null }>, total_value: 0 };

    const { data: deals } = await context.supabase
      .from("twenty_deals_cache")
      .select("twenty_id, name, amount_micros, currency, stage, close_date")
      .eq("user_id", context.userId)
      .order("amount_micros", { ascending: false, nullsFirst: false })
      .limit(20);

    const total = (deals ?? []).reduce((acc, d) => acc + Number(d.amount_micros ?? 0), 0);
    return {
      enabled: true,
      base_url: conn.base_url,
      deals: (deals ?? []).map((d) => ({ id: d.twenty_id, name: d.name, amount_micros: d.amount_micros, currency: d.currency, stage: d.stage, close_date: d.close_date })),
      total_value: total,
    };
  });

export const getTwentySyncStatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count: pending }, { count: doneToday }, { count: failed }] = await Promise.all([
      context.supabase.from("twenty_sync_queue").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "pending"),
      context.supabase.from("twenty_sync_queue").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "done").gte("updated_at", since),
      context.supabase.from("twenty_sync_queue").select("*", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "failed"),
    ]);
    return { pending: pending ?? 0, done_24h: doneToday ?? 0, failed: failed ?? 0 };
  });
