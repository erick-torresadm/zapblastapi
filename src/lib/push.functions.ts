import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(8),
  user_agent: z.string().optional().nullable(),
});

export const subscribePushFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubscribeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.user_agent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribePushFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const listAdminEventsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
    if (!roleRow) throw new Error("Forbidden");
    const { data, error } = await supabase
      .from("admin_push_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { events: data ?? [] };
  });

export const markEventReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("admin_push_events")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

export const sendTestPushFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
    if (!isAdmin) throw new Error("Forbidden");
    await (supabase.rpc as unknown as (n: string, p: Record<string, unknown>) => Promise<unknown>)(
      "emit_admin_event",
      {
        _type: "test",
        _title: "Notificação de teste",
        _body: "Se você está vendo isso no celular, o PWA está funcionando! 🎉",
        _url: "/app/admin/notifications",
        _meta: {},
      },
    );
    // Dispara o ciclo de envio na hora (não espera o cron)
    try {
      await fetch("https://zapblastapi.lovable.app/api/public/dispatch-admin-pushes", { method: "POST" });
    } catch (_) {}
    return { ok: true };
  });
