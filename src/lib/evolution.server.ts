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

// ============================================================================
// 0) ENDPOINT MAP — SINGLE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// Se a Evolution API mudar um path/método em um update, altere AQUI (1 linha).
// Toda função neste arquivo lê de EVOLUTION_ENDPOINTS — nada hardcoded.
//
// Variáveis nos paths:
//   {instance} → encodeURIComponent(instanceName)
// ============================================================================

type Method = "GET" | "POST" | "PUT" | "DELETE";
type Endpoint = { method: Method; path: string };

export const EVOLUTION_ENDPOINTS = {
  // Instance lifecycle
  createInstance:        { method: "POST",   path: "/instance/create" },
  connectInstance:       { method: "GET",    path: "/instance/connect/{instance}" },
  instanceState:         { method: "GET",    path: "/instance/connectionState/{instance}" },
  fetchInstances:        { method: "GET",    path: "/instance/fetchInstances" },
  logoutInstance:        { method: "DELETE", path: "/instance/logout/{instance}" },
  deleteInstance:        { method: "DELETE", path: "/instance/delete/{instance}" },
  restartInstance:       { method: "PUT",    path: "/instance/restart/{instance}" },
  restartInstanceLegacy: { method: "POST",   path: "/instance/restart/{instance}" },

  // Webhook
  setWebhook:    { method: "POST", path: "/webhook/set/{instance}" },
  findWebhook:   { method: "GET",  path: "/webhook/find/{instance}" },

  // Send
  sendText:           { method: "POST", path: "/message/sendText/{instance}" },
  sendMedia:          { method: "POST", path: "/message/sendMedia/{instance}" },
  sendWhatsAppAudio:  { method: "POST", path: "/message/sendWhatsAppAudio/{instance}" },
  sendSticker:        { method: "POST", path: "/message/sendSticker/{instance}" },
  sendLocation:       { method: "POST", path: "/message/sendLocation/{instance}" },
  sendContact:        { method: "POST", path: "/message/sendContact/{instance}" },
  sendReaction:       { method: "POST", path: "/message/sendReaction/{instance}" },
  sendPoll:           { method: "POST", path: "/message/sendPoll/{instance}" },

  // Chat / contact
  whatsappNumbers:           { method: "POST", path: "/chat/whatsappNumbers/{instance}" },
  fetchProfile:              { method: "POST", path: "/chat/fetchProfile/{instance}" },
  fetchProfilePictureUrl:    { method: "GET",  path: "/chat/fetchProfilePictureUrl/{instance}" },
  getBase64FromMediaMessage: { method: "POST", path: "/chat/getBase64FromMediaMessage/{instance}" },
  markMessageAsRead:         { method: "POST", path: "/chat/markMessageAsRead/{instance}" },
  sendPresence:              { method: "POST", path: "/chat/sendPresence/{instance}" },
  findContacts:              { method: "POST", path: "/chat/findContacts/{instance}" },
  findChats:                 { method: "POST", path: "/chat/findChats/{instance}" },

  // Groups
  inviteInfoGroup:    { method: "GET",  path: "/group/inviteInfo/{instance}" },
  acceptInviteCode:   { method: "GET",  path: "/group/acceptInviteCode/{instance}" },
  findGroupInfos:     { method: "GET",  path: "/group/findGroupInfos/{instance}" },
  fetchAllGroups:     { method: "GET",  path: "/group/fetchAllGroups/{instance}" },
  createGroup:        { method: "POST", path: "/group/create/{instance}" },
  fetchInviteCode:    { method: "GET",  path: "/group/inviteCode/{instance}" },
  updateGroupPicture: { method: "POST", path: "/group/updateGroupPicture/{instance}" },
  updateParticipant:  { method: "POST", path: "/group/updateParticipant/{instance}" },

  // Server-level
  root: { method: "GET", path: "/" },
} as const satisfies Record<string, Endpoint>;

export type EvolutionEndpointKey = keyof typeof EVOLUTION_ENDPOINTS;

/** Builds a path from EVOLUTION_ENDPOINTS, injecting {instance} and an optional query string. */
function ep(key: EvolutionEndpointKey, vars?: { instance?: string; query?: Record<string, string | number | boolean | undefined> }): string {
  let path: string = EVOLUTION_ENDPOINTS[key].path;
  if (vars?.instance != null) path = path.replace("{instance}", encodeURIComponent(vars.instance));
  if (vars?.query) {
    const qs = Object.entries(vars.query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) path += (path.includes("?") ? "&" : "?") + qs;
  }
  return path;
}

/** Returns the HTTP method registered for an endpoint. */
function epMethod(key: EvolutionEndpointKey): Method {
  return EVOLUTION_ENDPOINTS[key].method;
}

// ----- core fetch ------------------------------------------------------------

async function evoFetchRaw(
  server: EvolutionServer,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = server.base_url.replace(/\/$/, "") + path;
  const headers: Record<string, string> = {
    apikey: server.api_key,
    ...((init.headers as Record<string, string>) || {}),
  };
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

async function evoFetch(
  server: EvolutionServer,
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const body = await evoFetchRaw(server, path, init);
  return (body && typeof body === "object" && !Array.isArray(body) ? body : { value: body }) as Record<string, unknown>;
}

function evoArray<T>(body: unknown, keys: string[] = []): T[] {
  if (Array.isArray(body)) return body as T[];
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  for (const key of [...keys, "data", "value", "contacts", "chats", "groups"]) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

// ============================================================================
// 1) Instance management
// ============================================================================


export async function createInstance(
  server: EvolutionServer,
  instanceName: string,
  webhookUrl?: string,
) {
  return evoFetch(server, ep("createInstance"), {
    method: epMethod("createInstance"),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...(webhookUrl ? {
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "PRESENCE_UPDATE"],
        },
      } : {}),
    }),
  });
}

export async function connectInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, ep("connectInstance", { instance: instanceName }), { method: epMethod("connectInstance") });
}

export async function instanceState(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, ep("instanceState", { instance: instanceName }), { method: epMethod("instanceState") });
}

export async function fetchInstances(server: EvolutionServer, instanceName?: string) {
  return evoFetch(server, ep("fetchInstances", { query: { instanceName } }), { method: epMethod("fetchInstances") });
}

export async function logoutInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, ep("logoutInstance", { instance: instanceName }), { method: epMethod("logoutInstance") });
}

export async function deleteInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, ep("deleteInstance", { instance: instanceName }), { method: epMethod("deleteInstance") });
}

export async function restartInstance(server: EvolutionServer, instanceName: string) {
  // v2 usa PUT; deployments antigos aceitam POST. Tenta o canônico primeiro.
  try {
    return await evoFetch(server, ep("restartInstance", { instance: instanceName }), { method: epMethod("restartInstance") });
  } catch {
    return evoFetch(server, ep("restartInstanceLegacy", { instance: instanceName }), { method: epMethod("restartInstanceLegacy") });
  }
}

// ============================================================================
// 1b) Server-level helpers (versão / healthcheck)
// ============================================================================

/** Ping no root da Evolution. Retorna `{ ok, version?, raw? }` sem lançar. */
export async function pingServer(server: EvolutionServer): Promise<{ ok: boolean; version?: string; raw?: unknown; error?: string }> {
  try {
    const r = await evoFetch(server, ep("root"), { method: epMethod("root") });
    const version = (r as { version?: string; manager?: { version?: string } }).version
      ?? (r as { manager?: { version?: string } }).manager?.version;
    return { ok: true, version, raw: r };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Tenta detectar a versão da Evolution. Útil para alertar quando muda. */
export async function detectEvolutionVersion(server: EvolutionServer): Promise<string | null> {
  const p = await pingServer(server);
  return p.version ?? null;
}

// ============================================================================
// 2) Webhook configuration
// ============================================================================

export async function setWebhook(server: EvolutionServer, instanceName: string, webhookUrl: string) {
  return evoFetch(server, ep("setWebhook", { instance: instanceName }), {
    method: epMethod("setWebhook"),
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "PRESENCE_UPDATE"],
      },
    }),
  });
}

export async function findWebhook(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, ep("findWebhook", { instance: instanceName }), { method: epMethod("findWebhook") });
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
  return evoFetch(server, ep("sendText", { instance: instanceName }), {
    method: epMethod("sendText"),
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
  return evoFetch(server, ep("sendMedia", { instance: instanceName }), {
    method: epMethod("sendMedia"),
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
  return evoFetch(server, ep("sendWhatsAppAudio", { instance: instanceName }), {
    method: epMethod("sendWhatsAppAudio"),
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
  return evoFetch(server, ep("sendSticker", { instance: instanceName }), {
    method: epMethod("sendSticker"),
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
  return evoFetch(server, ep("sendLocation", { instance: instanceName }), {
    method: epMethod("sendLocation"),
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
  return evoFetch(server, ep("sendContact", { instance: instanceName }), {
    method: epMethod("sendContact"),
    body: JSON.stringify({ number: phone, contact: contacts }),
  });
}

export async function sendReaction(
  server: EvolutionServer,
  instanceName: string,
  key: { remoteJid: string; fromMe: boolean; id: string },
  reaction: string,
) {
  return evoFetch(server, ep("sendReaction", { instance: instanceName }), {
    method: epMethod("sendReaction"),
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
  return evoFetch(server, ep("sendPoll", { instance: instanceName }), {
    method: epMethod("sendPoll"),
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
  const res = await evoFetchRaw(server, ep("whatsappNumbers", { instance: instanceName }), {
    method: epMethod("whatsappNumbers"),
    body: JSON.stringify({ numbers }),
  });
  return evoArray<WhatsappCheck>(res, ["numbers"]);
}

export async function fetchProfile(server: EvolutionServer, instanceName: string, number: string) {
  return evoFetch(server, ep("fetchProfile", { instance: instanceName }), {
    method: epMethod("fetchProfile"),
    body: JSON.stringify({ number }),
  });
}

export async function fetchProfilePictureUrl(server: EvolutionServer, instanceName: string, number: string) {
  return evoFetch(
    server,
    ep("fetchProfilePictureUrl", { instance: instanceName, query: { number, sendUrl: true } }),
    { method: epMethod("fetchProfilePictureUrl") },
  );
}

/**
 * Download base64 of a received media message.
 * Pass the raw `message` object from a `messages.upsert` webhook payload.
 * Returns `{ base64, mimetype, fileName? }` (Evolution v2 response).
 */
export async function getBase64FromMediaMessage(
  server: EvolutionServer,
  instanceName: string,
  message: { key: { id?: string; remoteJid?: string; fromMe?: boolean }; message?: unknown },
  convertToMp4 = false,
): Promise<{ base64: string; mimetype?: string; fileName?: string } | null> {
  try {
    const res = await evoFetch(
      server,
      ep("getBase64FromMediaMessage", { instance: instanceName }),
      {
        method: epMethod("getBase64FromMediaMessage"),
        body: JSON.stringify({ message, convertToMp4 }),
      },
    );
    const b64 = (res as { base64?: string }).base64;
    if (!b64) return null;
    return {
      base64: b64,
      mimetype: (res as { mimetype?: string }).mimetype,
      fileName: (res as { fileName?: string }).fileName,
    };
  } catch (e) {
    console.warn("[evolution] getBase64FromMediaMessage failed", e);
    return null;
  }
}

export async function markMessageAsRead(
  server: EvolutionServer,
  instanceName: string,
  messages: Array<{ id: string; fromMe: boolean; remoteJid: string }>,
) {
  return evoFetch(server, ep("markMessageAsRead", { instance: instanceName }), {
    method: epMethod("markMessageAsRead"),
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
  return evoFetch(server, ep("sendPresence", { instance: instanceName }), {
    method: epMethod("sendPresence"),
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

// ============================================================================
// 7) Groups
// ============================================================================

export type GroupParticipant = {
  id: string;            // JID (5511...@s.whatsapp.net or ...@lid)
  admin?: "admin" | "superadmin" | null;
};

export type GroupInfo = {
  id: string;            // group JID like 5511...-1709...@g.us
  subject?: string;
  size?: number;
  participants?: GroupParticipant[];
  [k: string]: unknown;
};

/** Extract invite code from any of: full URL, "chat.whatsapp.com/CODE", or plain code. */
export function parseGroupInviteCode(input: string): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/** Look up group info from an invite code (no need to be a member). */
export async function inviteInfoGroup(
  server: EvolutionServer,
  instanceName: string,
  inviteCode: string,
): Promise<GroupInfo> {
  const r = await evoFetch(
    server,
    ep("inviteInfoGroup", { instance: instanceName, query: { inviteCode } }),
    { method: epMethod("inviteInfoGroup") },
  );
  return r as GroupInfo;
}

/** Join a group using an invite code. The instance will become a member of the group. */
export async function acceptInviteCode(
  server: EvolutionServer,
  instanceName: string,
  inviteCode: string,
): Promise<{ groupJid?: string; status?: string; [k: string]: unknown }> {
  const r = await evoFetch(
    server,
    ep("acceptInviteCode", { instance: instanceName, query: { inviteCode } }),
    { method: epMethod("acceptInviteCode") },
  );
  return r as { groupJid?: string; status?: string; [k: string]: unknown };
}



/** Get full group info (incl. participants) by group JID. The instance must be a member. */
export async function findGroupInfos(
  server: EvolutionServer,
  instanceName: string,
  groupJid: string,
): Promise<GroupInfo> {
  const r = await evoFetch(
    server,
    ep("findGroupInfos", { instance: instanceName, query: { groupJid } }),
    { method: epMethod("findGroupInfos") },
  );
  return r as GroupInfo;
}

/** Fetch all groups the instance participates in. */
export async function fetchAllGroups(
  server: EvolutionServer,
  instanceName: string,
  getParticipants = false,
): Promise<GroupInfo[]> {
  const r = await evoFetchRaw(
    server,
    ep("fetchAllGroups", { instance: instanceName, query: { getParticipants } }),
    { method: epMethod("fetchAllGroups") },
  );
  return evoArray<GroupInfo>(r, ["groups"]);
}

// ============================================================================
// 8) Contacts (saved/unsaved)
// ============================================================================

export type EvolutionContact = {
  id: string;              // JID
  remoteJid?: string;
  pushName?: string | null;
  profilePicUrl?: string | null;
  /** Saved name (from device address book sync). Empty/null means not saved. */
  name?: string | null;
  verifiedName?: string | null;
  [k: string]: unknown;
};

/** Fetch all contacts the instance knows about (chats + address book sync). */
export async function findContacts(
  server: EvolutionServer,
  instanceName: string,
): Promise<EvolutionContact[]> {
  const r = await evoFetchRaw(
    server,
    ep("findContacts", { instance: instanceName }),
    { method: epMethod("findContacts"), body: JSON.stringify({ where: {} }) },
  );
  return evoArray<EvolutionContact>(r, ["contacts"]);
}

export type EvolutionChat = {
  id?: string | null;
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  pushName?: string | null;
  name?: string | null;
  profilePicUrl?: string | null;
  [k: string]: unknown;
};

/** Fetch all chats the instance knows about. Includes remoteJid/remoteJidAlt (lid mapping). */
export async function findChats(
  server: EvolutionServer,
  instanceName: string,
): Promise<EvolutionChat[]> {
  const r = await evoFetchRaw(
    server,
    ep("findChats", { instance: instanceName }),
    { method: epMethod("findChats"), body: JSON.stringify({}) },
  );
  return evoArray<EvolutionChat>(r, ["chats"]);
}


// ============================================================================
// 9) Group write operations (create / invite / picture)
// ============================================================================

/** Create a new WhatsApp group. The instance is automatically an admin. */
export async function createGroup(
  server: EvolutionServer,
  instanceName: string,
  payload: { subject: string; description?: string; participants?: string[] },
): Promise<{ id?: string; groupJid?: string; subject?: string; [k: string]: unknown }> {
  const body = {
    subject: payload.subject,
    description: payload.description ?? "",
    participants: payload.participants ?? [],
  };
  const r = await evoFetch(server, ep("createGroup", { instance: instanceName }), {
    method: epMethod("createGroup"),
    body: JSON.stringify(body),
  });
  return r as { id?: string; groupJid?: string };
}

/** Fetch the public invite code for a group (instance must be admin). */
export async function fetchInviteCode(
  server: EvolutionServer,
  instanceName: string,
  groupJid: string,
): Promise<{ inviteCode: string; inviteUrl: string }> {
  const r = await evoFetch(
    server,
    ep("fetchInviteCode", { instance: instanceName, query: { groupJid } }),
    { method: epMethod("fetchInviteCode") },
  );
  const code = String((r as { inviteCode?: string }).inviteCode ?? "");
  const url = String((r as { inviteUrl?: string }).inviteUrl ?? (code ? `https://chat.whatsapp.com/${code}` : ""));
  return { inviteCode: code, inviteUrl: url };
}

/** Update group picture by URL. */
export async function updateGroupPicture(
  server: EvolutionServer,
  instanceName: string,
  groupJid: string,
  imageUrl: string,
): Promise<unknown> {
  return evoFetch(
    server,
    ep("updateGroupPicture", { instance: instanceName, query: { groupJid } }),
    {
      method: epMethod("updateGroupPicture"),
      body: JSON.stringify({ image: imageUrl }),
    },
  );
}

/** Add / remove / promote / demote participants in a group. */
export async function updateGroupParticipant(
  server: EvolutionServer,
  instanceName: string,
  groupJid: string,
  action: "add" | "remove" | "promote" | "demote",
  participants: string[],
): Promise<unknown> {
  return evoFetch(
    server,
    ep("updateParticipant", { instance: instanceName, query: { groupJid } }),
    {
      method: epMethod("updateParticipant"),
      body: JSON.stringify({ action, participants }),
    },
  );
}
