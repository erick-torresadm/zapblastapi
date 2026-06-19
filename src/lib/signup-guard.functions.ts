// Anti-abuso de cadastro:
// - Bloqueia múltiplas contas do mesmo IP / sub-rede
// - Bloqueia variações do mesmo e-mail (Gmail sem ponto / +tag)
// - Bloqueia domínios descartáveis
// - Bloqueia identidades já queimadas (blocklist)
// - Registra device fingerprint para detecção futura
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

const MAX_ACCOUNTS_PER_IP = 2;
const MAX_ACCOUNTS_PER_SUBNET = 4;
const MAX_ACCOUNTS_PER_FINGERPRINT = 1;
const MAX_ACCOUNTS_PER_EMAIL_NORM = 1;
const WINDOW_DAYS = 90;
const PEPPER = process.env.SUPABASE_JWKS ?? "perseidas-fallback-pepper-v1";

function readIp(): string {
  const ip = getRequestIP({ xForwardedFor: true })
    ?? getRequestHeader("cf-connecting-ip")
    ?? getRequestHeader("x-real-ip")
    ?? "unknown";
  return String(ip).split(",")[0]!.trim();
}

function ipSubnet(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  // IPv4 → /24
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split(".").slice(0, 3).join(".") + ".0/24";
  }
  // IPv6 → /64 (primeiros 4 grupos)
  if (ip.includes(":")) {
    const parts = ip.split(":").slice(0, 4);
    return parts.join(":") + "::/64";
  }
  return null;
}

function hash(value: string): string {
  return createHash("sha256").update(PEPPER + ":" + value).digest("hex");
}

function normalizeEmail(email: string): string {
  const e = email.toLowerCase().trim();
  const [localRaw, domainRaw] = e.split("@");
  if (!domainRaw) return e;
  let local = (localRaw ?? "").split("+")[0]!;
  let domain = domainRaw;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

const SIGNUP_BLOCK_MESSAGE =
  "Não foi possível criar a conta. Se você acredita que isso é um engano, fale com o suporte.";

// ============= PRE-SIGNUP CHECK =============
export const preSignupCheckFn = createServerFn({ method: "POST" })
  .inputValidator((i: { email: string; fingerprint?: string | null }) =>
    z.object({
      email: z.string().email().max(255),
      fingerprint: z.string().min(8).max(128).nullable().optional(),
    }).parse(i))
  .handler(async ({ data }) => {
    const ip = readIp();
    const subnet = ipSubnet(ip);
    const country = getRequestHeader("cf-ipcountry") ?? null;
    const emailNorm = normalizeEmail(data.email);
    const emailHash = hash(emailNorm);
    const fpHash = data.fingerprint ? hash(data.fingerprint) : null;
    const domain = emailNorm.split("@")[1] ?? "";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Domínio descartável
    if (domain) {
      const { data: disp } = await supabaseAdmin
        .from("disposable_email_domains" as any)
        .select("domain")
        .eq("domain", domain)
        .maybeSingle();
      if (disp) return { ok: false as const, reason: "Use um e-mail pessoal ou corporativo (sem serviços de e-mail temporário)." };
    }

    // 2) Blocklist unificada (e-mail norm, fingerprint, IP, subnet)
    const blockChecks: Array<{ kind: string; value_hash: string }> = [
      { kind: "email_norm", value_hash: emailHash },
      { kind: "ip", value_hash: hash(ip) },
    ];
    if (subnet) blockChecks.push({ kind: "ip_subnet", value_hash: hash(subnet) });
    if (fpHash) blockChecks.push({ kind: "fingerprint", value_hash: fpHash });

    const { data: hits } = await supabaseAdmin
      .from("trial_abuse_blocklist" as any)
      .select("kind")
      .in("value_hash", blockChecks.map(b => b.value_hash))
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .limit(1);
    if (hits && hits.length > 0) return { ok: false as const, reason: SIGNUP_BLOCK_MESSAGE };

    // 3) Limites de frequência por sinal nos últimos WINDOW_DAYS
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

    // 3a) E-mail normalizado já usado → bloqueia (mesmo e-mail real)
    const { count: emailCount } = await supabaseAdmin
      .from("signup_device_log" as any)
      .select("id", { count: "exact", head: true })
      .eq("email_norm_hash", emailHash);
    if ((emailCount ?? 0) >= MAX_ACCOUNTS_PER_EMAIL_NORM) {
      return { ok: false as const, reason: "Esse e-mail (ou uma variação dele) já tem conta. Faça login ou recupere a senha." };
    }

    // 3b) Fingerprint
    if (fpHash) {
      const { count: fpCount } = await supabaseAdmin
        .from("signup_device_log" as any)
        .select("id", { count: "exact", head: true })
        .eq("fingerprint_hash", fpHash)
        .gte("created_at", since);
      if ((fpCount ?? 0) >= MAX_ACCOUNTS_PER_FINGERPRINT) {
        return { ok: false as const, reason: "Esse dispositivo já criou uma conta recentemente." };
      }
    }

    // 3c) IP exato
    if (ip !== "unknown") {
      const { count: ipCount } = await supabaseAdmin
        .from("signup_ip_log")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", since);
      if ((ipCount ?? 0) >= MAX_ACCOUNTS_PER_IP) {
        return { ok: false as const, reason: SIGNUP_BLOCK_MESSAGE };
      }
    }

    // 3d) Sub-rede
    if (subnet) {
      const { count: subCount } = await supabaseAdmin
        .from("signup_ip_log")
        .select("id", { count: "exact", head: true })
        .eq("ip_subnet", subnet)
        .gte("created_at", since);
      if ((subCount ?? 0) >= MAX_ACCOUNTS_PER_SUBNET) {
        return { ok: false as const, reason: SIGNUP_BLOCK_MESSAGE };
      }
    }

    return { ok: true as const, ip, subnet, country, emailNorm };
  });

// Compat — auth.tsx antigo ainda pode chamar este nome.
export const checkSignupIpFn = preSignupCheckFn;

// ============= POST-SIGNUP RECORD =============
export const recordSignupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { fingerprint?: string | null; email?: string | null }) =>
    z.object({
      fingerprint: z.string().min(8).max(128).nullable().optional(),
      email: z.string().email().max(255).nullable().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const ip = readIp();
    const subnet = ipSubnet(ip);
    const country = getRequestHeader("cf-ipcountry") ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const fpHash = data.fingerprint ? hash(data.fingerprint) : null;
    const emailHash = data.email ? hash(normalizeEmail(data.email)) : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("signup_ip_log").insert({
      user_id: context.userId, ip, ip_subnet: subnet, country, user_agent: ua,
    });
    await supabaseAdmin.from("signup_device_log" as any).insert({
      user_id: context.userId,
      fingerprint_hash: fpHash,
      email_norm_hash: emailHash,
      ip, ip_subnet: subnet, country, user_agent: ua,
    });
    return { ok: true };
  });

// Compat
export const recordSignupIpFn = recordSignupFn;

// ============= ADMIN: queimar identidade =============
export const banIdentityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { user_id: string; reason?: string }) =>
    z.object({ user_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    // Só admin
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" as any });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Coleta sinais do usuário
    const { data: dev } = await supabaseAdmin
      .from("signup_device_log" as any)
      .select("fingerprint_hash,email_norm_hash,ip,ip_subnet")
      .eq("user_id", data.user_id);
    const entries: Array<{ kind: string; value_hash: string; reason: string; created_by: string }> = [];
    (dev ?? []).forEach((d: any) => {
      if (d.fingerprint_hash) entries.push({ kind: "fingerprint", value_hash: d.fingerprint_hash, reason: data.reason ?? "Banned", created_by: context.userId });
      if (d.email_norm_hash) entries.push({ kind: "email_norm", value_hash: d.email_norm_hash, reason: data.reason ?? "Banned", created_by: context.userId });
      if (d.ip) entries.push({ kind: "ip", value_hash: hash(d.ip), reason: data.reason ?? "Banned", created_by: context.userId });
      if (d.ip_subnet) entries.push({ kind: "ip_subnet", value_hash: hash(d.ip_subnet), reason: data.reason ?? "Banned", created_by: context.userId });
    });
    if (entries.length) {
      await supabaseAdmin.from("trial_abuse_blocklist" as any).upsert(entries, { onConflict: "kind,value_hash" });
    }
    return { ok: true, inserted: entries.length };
  });
