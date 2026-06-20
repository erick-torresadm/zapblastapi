// Server functions de segurança: lockout de login, auditoria admin, listagem de eventos.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getClientMeta() {
  let ip = "";
  try { ip = getRequestIP({ xForwardedFor: true }) ?? ""; } catch { /* noop */ }
  const ua = getRequestHeader("user-agent") ?? "";
  return { ip, ua };
}

// Validação de senha forte (compartilhada — exportada para o cliente também via re-export)
export const STRONG_PASSWORD_MIN = 10;
export function validatePasswordStrength(pwd: string): { ok: boolean; reason?: string } {
  if (typeof pwd !== "string") return { ok: false, reason: "Senha inválida." };
  if (pwd.length < STRONG_PASSWORD_MIN) return { ok: false, reason: `Mínimo ${STRONG_PASSWORD_MIN} caracteres.` };
  if (!/[A-Za-z]/.test(pwd)) return { ok: false, reason: "Inclua ao menos uma letra." };
  if (!/[0-9]/.test(pwd)) return { ok: false, reason: "Inclua ao menos um número." };
  if (!/[^A-Za-z0-9]/.test(pwd)) return { ok: false, reason: "Inclua ao menos um símbolo (ex: ! @ # $)." };
  return { ok: true };
}

// ============ Pre-login: checa lockout ============
export const checkLoginLockoutFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => z.object({ email: z.string().email().max(254) }).parse(d))
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("check_login_lockout", {
      _email: data.email, _ip: ip,
    });
    if (error) return { allowed: true };
    return res as { allowed: boolean; reason?: string; retry_after_seconds?: number; fail_count?: number };
  });

// ============ Pós-login: registra resultado ============
export const recordLoginAttemptFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; success: boolean }) =>
    z.object({ email: z.string().email().max(254), success: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { ip, ua } = getClientMeta();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("record_login_attempt", {
      _email: data.email, _ip: ip, _success: data.success, _user_agent: ua.slice(0, 500),
    });
    return { ok: true };
  });

// ============ Admin: lê security_events / admin_audit_log / login_attempts ============
async function ensureAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("Falha ao verificar permissão.");
  if (!data) throw new Error("Acesso restrito a administradores.");
}

export const listSecurityEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; severity?: string; event_type?: string }) =>
    z.object({
      limit: z.number().int().min(1).max(500).optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      event_type: z.string().max(64).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("security_events").select("*").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.severity) q = q.eq("severity", data.severity);
    if (data.event_type) q = q.eq("event_type", data.event_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listAdminAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("admin_audit_log")
      .select("*").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listLoginAttemptsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; only_failed?: boolean }) =>
    z.object({ limit: z.number().int().min(1).max(500).optional(), only_failed: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("login_attempts").select("*").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.only_failed) q = q.eq("success", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============ Verifica se usuário atual é admin (para gate de rota) ============
export const checkIsAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });
