// ============================================================================
// Evolution API v2 — Server-side client library
// Reference: docs/evolution-api.md (full study)
// ----------------------------------------------------------------------------
// All endpoints accept either a global API key (admin) or an instance API key.
// Auth header: `apikey: <key>` (no Bearer prefix).
//
// Standard JID formats:
//   5511999999999@s.whatsapp.net   → individual contact
//   5511999999999-1709550600@g.us  → group
//   NNNNNNNNNN@lid                 → linked id (Meta privacy migration)
//
// Brazilian numbers may exist with or without the 9th digit; helpers below
// generate both variants and use `/chat/whatsappNumbers` to pick the JID
// WhatsApp actually serves.
// ============================================================================

export type EvolutionServer = { base_url: string; api_key: string };

// ----- core fetch ------------------------------------------------------------

async function evoFetch(
  server: EvolutionServer,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = server.base_url.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    apikey: server.api_key,
    ...((init.headers as Record<string, string>) || {}),
  };
  // Only set Content-Type for JSON bodies (FormData sets its own boundary).
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const msg = (() => {
      if (typeof body === "object" && body) {
        const b = body as { message?: unknown; error?: unknown };
        if (typeof b.message === "string") return b.message;
        if (b.message) return JSON.stringify(b.message);
        if (b.error) return String(b.error);
      }
      return text || `HTTP ${res.status}`;
    })();
    throw new Error(`Evolution API ${res.status}: ${msg}`);
  }
  return body;
}

// ============================================================================
// 1) Instance management
// ============================================================================

type JsonObj = Record<string, unknown>;

export async function createInstance(
  server: EvolutionServer,
  instanceName: string,
  webhookUrl?: string,
) {
  return evoFetch(server, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...(webhookUrl ? {
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
        },
      } : {}),
    }),
  });
}

export async function connectInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/connect/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function instanceState(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function fetchInstances(server: EvolutionServer, instanceName?: string) {
  const q = instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : "";
  return evoFetch(server, `/instance/fetchInstances${q}`, { method: "GET" });
}

export async function logoutInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function restartInstance(server: EvolutionServer, instanceName: string) {
  // Docs note v2 uses PUT; older deployments accept POST. Try PUT first, then POST.
  try {
    return await evoFetch(server, `/instance/restart/${encodeURIComponent(instanceName)}`, { method: "PUT" });
  } catch {
    return evoFetch(server, `/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST" });
  }
}

// ============================================================================
// 2) Webhook configuration
// ============================================================================

export async function setWebhook(server: EvolutionServer, instanceName: string, webhookUrl: string) {
  return evoFetch(server, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
      },
    }),
  });
}

export async function findWebhook(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/webhook/find/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

// ============================================================================
// 3) Send messages
// ============================================================================

type SendCommonOpts = {
  delayMs?: number;
  quoted?: { key: { id: string; remoteJid: string; fromMe: boolean }; message: Record<string, unknown> };
  mentioned?: string[];
  mentionsEveryOne?: boolean;
  linkPreview?: boolean;
};

function commonPayload(o?: SendCommonOpts): Record<string, unknown> {
  if (!o) return {};
  const out: Record<string, unknown> = {};
  if (o.delayMs != null) out.delay = o.delayMs;
  if (o.quoted) out.quoted = o.quoted;
  if (o.mentioned?.length) out.mentioned = o.mentioned;
  if (o.mentionsEveryOne) out.mentionsEveryOne = true;
  if (o.linkPreview != null) out.linkPreview = o.linkPreview;
  return out;
}

export async function sendText(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  text: string,
  delayMsOrOpts?: number | SendCommonOpts,
) {
  const opts: SendCommonOpts | undefined = typeof delayMsOrOpts === "number"
    ? { delayMs: delayMsOrOpts }
    : delayMsOrOpts;
  return evoFetch(server, `/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text, ...commonPayload(opts) }),
  });
}

export type MediaType = "image" | "video" | "document" | "audio";

/**
 * Send image / video / document / generic audio.
 *
 * ⚠️ For voice notes (PTT with waveform UI) prefer `sendWhatsAppAudio`.
 * `sendMedia` with `mediatype: "audio"` plays as a regular audio attachment.
 *
 * `media` accepts a public URL OR a base64 data URI (`data:image/png;base64,...`).
 */
export async function sendMedia(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  opts: {
    mediatype: MediaType;
    media: string;
    caption?: string;
    fileName?: string;
    mimetype?: string;
  },
  delayMsOrOpts?: number | SendCommonOpts,
) {
  const o: SendCommonOpts | undefined = typeof delayMsOrOpts === "number"
    ? { delayMs: delayMsOrOpts }
    : delayMsOrOpts;
  return evoFetch(server, `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      mediatype: opts.mediatype,
      media: opts.media,
      ...(opts.caption ? { caption: opts.caption } : {}),
      ...(opts.fileName ? { fileName: opts.fileName } : {}),
      ...(opts.mimetype ? { mimetype: opts.mimetype } : {}),
      ...commonPayload(o),
    }),
  });
}

/**
 * Send a WhatsApp voice note (PTT). Renders with the waveform/playback UI.
 * Pass `encoding: true` (default) to let Evolution transcode to OGG/Opus.
 */
export async function sendWhatsAppAudio(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  audio: string,
  opts?: { delayMs?: number; encoding?: boolean },
) {
  return evoFetch(server, `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      audio,
      encoding: opts?.encoding ?? true,
      ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    }),
  });
}

export async function sendSticker(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  sticker: string,
  opts?: { delayMs?: number },
) {
  return evoFetch(server, `/message/sendSticker/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, sticker, ...(opts?.delayMs ? { delay: opts.delayMs } : {}) }),
  });
}

export async function sendLocation(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  loc: { name?: string; address?: string; latitude: number; longitude: number },
  opts?: { delayMs?: number },
) {
  return evoFetch(server, `/message/sendLocation/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, ...loc, ...(opts?.delayMs ? { delay: opts.delayMs } : {}) }),
  });
}

export async function sendContact(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  contacts: Array<{
    fullName: string;
    wuid: string;
    phoneNumber: string;
    organization?: string;
    email?: string;
    url?: string;
  }>,
) {
  return evoFetch(server, `/message/sendContact/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, contact: contacts }),
  });
}

export async function sendReaction(
  server: EvolutionServer,
  instanceName: string,
  key: { remoteJid: string; fromMe: boolean; id: string },
  reaction: string,
) {
  return evoFetch(server, `/message/sendReaction/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ key, reaction }),
  });
}

export async function sendPoll(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  poll: { name: string; selectableCount?: number; values: string[] },
  opts?: { delayMs?: number },
) {
  return evoFetch(server, `/message/sendPoll/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      name: poll.name,
      selectableCount: poll.selectableCount ?? 1,
      values: poll.values,
      ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    }),
  });
}

// ============================================================================
// 4) Chat controls
// ============================================================================

export type WhatsappCheck = { jid: string; exists: boolean; number: string };

/**
 * Check whether phone numbers are registered on WhatsApp.
 * Use the returned `jid` to send — WhatsApp may serve a 12-digit BR JID even
 * when you asked about a 13-digit number (and vice-versa).
 */
export async function checkWhatsappNumbers(
  server: EvolutionServer,
  instanceName: string,
  numbers: string[],
): Promise<WhatsappCheck[]> {
  const res = await evoFetch(server, `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ numbers }),
  });
  return (Array.isArray(res) ? res : []) as WhatsappCheck[];
}

export async function fetchProfile(server: EvolutionServer, instanceName: string, number: string) {
  return evoFetch(server, `/chat/fetchProfile/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number }),
  });
}

export async function fetchProfilePictureUrl(server: EvolutionServer, instanceName: string, number: string) {
  return evoFetch(
    server,
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(number)}&sendUrl=true`,
    { method: "GET" },
  );
}

export async function markMessageAsRead(
  server: EvolutionServer,
  instanceName: string,
  messages: Array<{ id: string; fromMe: boolean; remoteJid: string }>,
) {
  return evoFetch(server, `/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ readMessages: messages }),
  });
}

/**
 * Show typing / recording indicator without sending a message.
 * presence: "composing" = typing • "recording" = recording audio • "paused" = stop
 */
export async function sendPresence(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  presence: "composing" | "recording" | "paused",
  delayMs: number = 1200,
) {
  return evoFetch(server, `/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, presence, delay: delayMs }),
  });
}

// ============================================================================
// 5) Phone / JID helpers (Brazil-aware)
// ============================================================================

/** Strip non-digits and return a plain phone string (no JID suffix). */
export function normalizePhone(value: string | null | undefined): string {
  const raw = String(value ?? "");
  const user = raw.includes("@") ? raw.split("@")[0] : raw;
  return user.replace(/\D/g, "");
}

/** True if the value looks like a Meta privacy `@lid` identifier or a 15+ digit hash. */
export function isLidIdentifier(value: string | null | undefined): boolean {
  const raw = String(value ?? "");
  if (raw.endsWith("@lid")) return true;
  const digits = normalizePhone(raw);
  return digits.length >= 15;
}

/**
 * Brazilian numbers: WhatsApp sometimes stores the 12-digit form without the
 * 9th digit (`551181738903`) and sometimes the 13-digit form (`5511981738903`).
 * Returns both variants when applicable.
 */
export function brazilianPhoneVariants(phone: string): string[] {
  const digits = normalizePhone(phone);
  const out = new Set<string>([digits]);
  const m = digits.match(/^55(\d{2})(9?)(\d{8})$/);
  if (m) {
    const [, ddd, nine, rest] = m;
    out.add(`55${ddd}${rest}`);
    if (!nine) out.add(`55${ddd}9${rest}`);
  }
  return Array.from(out);
}

/**
 * Resolve a phone number to a JID WhatsApp confirms exists.
 * Tries every Brazilian variant via /chat/whatsappNumbers and returns the
 * `jid` of the first `exists: true` row. Falls back to `null` if none match.
 */
export async function resolveWhatsappJid(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
): Promise<string | null> {
  const variants = brazilianPhoneVariants(phone);
  try {
    const checked = await checkWhatsappNumbers(server, instanceName, variants);
    for (const row of checked) {
      if (row?.exists) return row.jid || row.number;
    }
  } catch (e) {
    console.warn("[evolution] resolveWhatsappJid failed", (e as Error).message);
  }
  return null;
}

// ============================================================================
// 6) Humanization helpers (anti-ban)
// ============================================================================

/** Time in ms to "type" a message at the given WPM (default 180). Clamped 0.8s–8s. */
export function typingDurationMs(text: string, wpm = 180): number {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  const ms = (words / wpm) * 60 * 1000;
  return Math.max(800, Math.min(8000, Math.round(ms)));
}

/** Random delay in [minMs, maxMs]. */
export function pickHumanDelayMs(minMs: number, maxMs: number): number {
  const lo = Math.max(0, Math.min(minMs, maxMs));
  const hi = Math.max(lo, Math.max(minMs, maxMs));
  return Math.floor(lo + Math.random() * (hi - lo));
}

/** Returns true if Brasília time (UTC-3, no DST) is inside the quiet window. */
export function isInQuietHours(startHour: number, endHour: number, now: Date = new Date()): boolean {
  const h = (now.getUTCHours() - 3 + 24) % 24;
  if (startHour === endHour) return false;
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}
