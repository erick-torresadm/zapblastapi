// Cliente Efí com mTLS — converte .p12 (PKCS#12) para PEM em runtime
// porque Supabase Edge Runtime (Deno) não suporta o campo `p12` em createHttpClient.
// Docs Efí: https://dev.efipay.com.br/docs/api-pix/credenciais/
import forge from "https://esm.sh/node-forge@1.3.1";

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

function p12ToPem(certB64: string, password = ""): { cert: string; key: string } {
  // base64 -> binary string -> forge ASN.1
  const der = atob(certB64);
  const p12Asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Pega chave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no .p12");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);

  // Pega cadeia de certificados
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag] ?? [];
  if (certs.length === 0) throw new Error("Certificado não encontrado no .p12");
  const certPem = certs.map((c) => forge.pki.certificateToPem(c.cert!)).join("\n");

  return { cert: certPem, key: keyPem };
}

// deno-lint-ignore no-explicit-any
let _client: any = null;
let _clientEnv: EfiEnv | null = null;

function getClient(env: EfiEnv) {
  if (_client && _clientEnv === env) return _client;
  const { certB64 } = creds(env);
  if (!certB64) throw new Error(`Certificado ausente: configure EFI_CERT_${env === "prod" ? "PROD" : "SANDBOX"}_BASE64`);
  // deno-lint-ignore no-explicit-any
  const createHttpClient = (Deno as any).createHttpClient;
  if (typeof createHttpClient !== "function") {
    throw new Error("Deno.createHttpClient indisponível neste runtime — mTLS não suportado");
  }
  const { cert, key } = p12ToPem(certB64, "");
  _client = createHttpClient({ cert, key });
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
  if (!clientId || !clientSecret) {
    throw new Error(`Efí cobrancas: configure EFI_CLIENT_ID_${env === "prod" ? "PROD" : "SANDBOX"} e EFI_CLIENT_SECRET_${env === "prod" ? "PROD" : "SANDBOX"}`);
  }
  const basic = btoa(`${clientId}:${clientSecret}`);
  // API de cobranças NÃO usa mTLS; OAuth em /v1/authorize
  const res = await fetch(`${base}/v1/authorize`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Efí OAuth (cobrancas) ${res.status}: ${txt}`);
  }
  const json = await res.json();
  _token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, env };
  return _token.value;
}

export async function efiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = getEnv();
  const { base } = creds(env);
  const token = await getToken();
  return await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
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
  const client = getClient(env);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${pixBase(env)}/oauth/token`, {
    method: "POST",
    // deno-lint-ignore no-explicit-any
    client,
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  // deno-lint-ignore no-explicit-any
  } as any);
  if (!res.ok) throw new Error(`Efí OAuth (pix) ${res.status}: ${await res.text()}`);
  const json = await res.json();
  _pixToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, env };
  return _pixToken.value;
}

export async function efiPixFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = getEnv();
  const token = await getPixToken();
  const client = getClient(env);
  return await fetch(`${pixBase(env)}${path}`, {
    ...init,
    // deno-lint-ignore no-explicit-any
    client,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  // deno-lint-ignore no-explicit-any
  } as any);
}
