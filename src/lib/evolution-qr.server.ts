// Server-only helpers para extrair o QR code de respostas/eventos da Evolution API.

function asImageDataUrl(value: string, fromBase64Field = false) {
  const trimmed = value.trim();
  const embedded = trimmed.match(/data:image\/[a-zA-Z+.-]+;base64,([A-Za-z0-9+/=_-][A-Za-z0-9+/=\s_-]*)/);
  if (embedded) return `data:image/png;base64,${embedded[1].replace(/\s/g, "")}`;

  const raw = trimmed.replace(/^base64,?/i, "").replace(/\s/g, "");
  const looksLikeBase64 = raw.length > 80 && /^[A-Za-z0-9+/=_-]+$/.test(raw);
  if (fromBase64Field || looksLikeBase64) return `data:image/png;base64,${raw}`;
  return null;
}

function walkQrPayload(payload: unknown, visitor: (key: string, value: unknown) => string | null) {
  const seen = new Set<unknown>();
  const stack: Array<{ key: string; value: unknown }> = [{ key: "", value: payload }];
  while (stack.length) {
    const item = stack.shift()!;
    const found = visitor(item.key, item.value);
    if (found) return found;
    if (!item.value || typeof item.value !== "object" || seen.has(item.value)) continue;
    seen.add(item.value);
    Object.entries(item.value as Record<string, unknown>).forEach(([key, value]) => stack.push({ key, value }));
  }
  return null;
}

export async function normalizeQr(qr: unknown): Promise<string | null> {
  const base64 = walkQrPayload(qr, (key, value) => {
    if (typeof value !== "string") return null;
    return asImageDataUrl(value, key.toLowerCase().includes("base64"));
  });
  if (base64) return base64;

  const code = walkQrPayload(qr, (key, value) => {
    if (typeof value !== "string") return null;
    const k = key.toLowerCase();
    if (!["code", "qrcode", "qr", "qr_code", "pairingcode", "pairing_code"].includes(k)) return null;
    if (asImageDataUrl(value)) return null;
    return value.trim() || null;
  });
  if (!code) return null;
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(String(code), { width: 320, margin: 1 });
  } catch { return null; }
}

export function extractEvolutionState(payload: unknown) {
  return walkQrPayload(payload, (key, value) => {
    if (key.toLowerCase() !== "state" || typeof value !== "string") return null;
    return value;
  });
}

// Diagnóstico sanitizado: só estrutura, sem base64.
export function describePayload(p: unknown, depth = 0): string {
  if (p === null) return "null";
  if (typeof p !== "object") return typeof p;
  if (depth > 2) return "…";
  const obj = p as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 8);
  return `{ ${keys.map((k) => `${k}: ${describePayload(obj[k], depth + 1)}`).join(", ")} }`;
}
