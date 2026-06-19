// Cliente Efí com mTLS (certificado .p12) — Deno suporta nativamente via Deno.createHttpClient
// Docs: https://dev.efipay.com.br/docs/api-pix/credenciais/

const PROD_BASE = "https://cobrancas.api.efipay.com.br";
const SANDBOX_BASE = "https://cobrancas-h.api.efipay.com.br";
const PIX_PROD_BASE = "https://pix.api.efipay.com.br";
const PIX_SANDBOX_BASE = "https://pix-h.api.efipay.com.br";

type EfiEnv = "prod" | "sandbox";

function getEnv(): EfiEnv {
  return (Deno.env.get("EFI_ENV") ?? "sandbox") as EfiEnv;
}

function creds(env: EfiEnv) {
  if (env === "prod") {
    return {
      base: PROD_BASE,
      clientId: Deno.env.get("EFI_CLIENT_ID_PROD")!,
      clientSecret: Deno.env.get("EFI_CLIENT_SECRET_PROD")!,
      certB64: Deno.env.get("EFI_CERT_PROD_BASE64")!,
    };
  }
  return {
    base: SANDBOX_BASE,
    clientId: Deno.env.get("EFI_CLIENT_ID_SANDBOX")!,
    clientSecret: Deno.env.get("EFI_CLIENT_SECRET_SANDBOX")!,
    certB64: Deno.env.get("EFI_CERT_SANDBOX_BASE64")!,
  };
}

// deno-lint-ignore no-explicit-any
let _client: any = null;
let _clientEnv: EfiEnv | null = null;

async function getClient(env: EfiEnv) {
  if (_client && _clientEnv === env) return _client;
  const { certB64 } = creds(env);
  const p12 = Uint8Array.from(atob(certB64), (c) => c.charCodeAt(0));
  // Deno.createHttpClient accepts PKCS#12 via the "p12" field (Deno >=1.x with --unstable in older versions; in Supabase Edge Functions it's available).
  // deno-lint-ignore no-explicit-any
  _client = (Deno as any).createHttpClient({ p12: { data: p12, password: "" } });
  _clientEnv = env;
  return _client;
}

let _token: { value: string; expiresAt: number; env: EfiEnv } | null = null;

async function getToken(): Promise<string> {
  const env = getEnv();
  if (_token && _token.env === env && _token.expiresAt > Date.now() + 30_000) {
    return _token.value;
  }
  const { base, clientId, clientSecret } = creds(env);
  const client = await getClient(env);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    // deno-lint-ignore no-explicit-any
    client,
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  // deno-lint-ignore no-explicit-any
  } as any);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Efí OAuth failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  _token = {
    value: json.access_token as string,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
    env,
  };
  return _token.value;
}

export async function efiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = getEnv();
  const { base } = creds(env);
  const token = await getToken();
  const client = await getClient(env);
  return await fetch(`${base}${path}`, {
    ...init,
    // deno-lint-ignore no-explicit-any
    client,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  // deno-lint-ignore no-explicit-any
  } as any);
}

export function efiEnv(): EfiEnv {
  return getEnv();
}

// ===== PIX API (base separada) =====
let _pixToken: { value: string; expiresAt: number; env: EfiEnv } | null = null;

function pixBase(env: EfiEnv) {
  return env === "prod" ? PIX_PROD_BASE : PIX_SANDBOX_BASE;
}

async function getPixToken(): Promise<string> {
  const env = getEnv();
  if (_pixToken && _pixToken.env === env && _pixToken.expiresAt > Date.now() + 30_000) return _pixToken.value;
  const { clientId, clientSecret } = creds(env);
  const client = await getClient(env);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${pixBase(env)}/oauth/token`, {
    method: "POST",
    // deno-lint-ignore no-explicit-any
    client,
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  // deno-lint-ignore no-explicit-any
  } as any);
  if (!res.ok) throw new Error(`Efí PIX OAuth failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  _pixToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, env };
  return _pixToken.value;
}

export async function efiPixFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = getEnv();
  const token = await getPixToken();
  const client = await getClient(env);
  return await fetch(`${pixBase(env)}${path}`, {
    ...init,
    // deno-lint-ignore no-explicit-any
    client,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  // deno-lint-ignore no-explicit-any
  } as any);
}
