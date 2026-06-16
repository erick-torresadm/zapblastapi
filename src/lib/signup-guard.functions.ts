// Pré-cadastro: valida que o IP não criou várias contas recentemente.
// Pós-cadastro: registra o IP do novo usuário.
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_ACCOUNTS_PER_IP = 2;
const WINDOW_DAYS = 30;

function readIp(): string {
  const ip = getRequestIP({ xForwardedFor: true })
    ?? getRequestHeader("cf-connecting-ip")
    ?? getRequestHeader("x-real-ip")
    ?? "unknown";
  return String(ip).split(",")[0]!.trim();
}

export const checkSignupIpFn = createServerFn({ method: "POST" }).handler(async () => {
  const ip = readIp();
  if (ip === "unknown") return { ok: true as const, ip };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("signup_ip_log")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_ACCOUNTS_PER_IP) {
    return { ok: false as const, ip, reason: `Detectamos ${count} contas criadas desse IP nos últimos ${WINDOW_DAYS} dias. Entre em contato com o suporte se isso for um engano.` };
  }
  return { ok: true as const, ip };
});

export const recordSignupIpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ip = readIp();
    const ua = getRequestHeader("user-agent") ?? null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("signup_ip_log").insert({
      user_id: context.userId, ip, user_agent: ua,
    });
    return { ok: true };
  });
