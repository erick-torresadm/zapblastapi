// Server-only client for Evolution API. Used inside server fn handlers and webhook routes.

export type EvolutionServer = { base_url: string; api_key: string };

async function evoFetch(server: EvolutionServer, path: string, init: RequestInit = {}) {
  const url = server.base_url.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: server.api_key,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "message" in body
      ? String((body as { message: unknown }).message)
      : text || `HTTP ${res.status}`;
    throw new Error(`Evolution API ${res.status}: ${msg}`);
  }
  return body as Record<string, unknown>;
}

export async function createInstance(server: EvolutionServer, instanceName: string, webhookUrl?: string) {
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
          events: [
            "QRCODE_UPDATED",
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
          ],
        },
      } : {}),
    }),
  });
}

export async function connectInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/connect/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function deleteInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function instanceState(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function logoutInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function restartInstance(server: EvolutionServer, instanceName: string) {
  return evoFetch(server, `/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST" });
}

export async function sendText(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  text: string,
  delayMs?: number,
) {
  return evoFetch(server, `/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: phone, text, ...(delayMs ? { delay: delayMs } : {}) }),
  });
}

export async function sendMedia(
  server: EvolutionServer,
  instanceName: string,
  phone: string,
  opts: { mediatype: "image" | "video" | "document" | "audio"; media: string; caption?: string; fileName?: string },
  delayMs?: number,
) {
  return evoFetch(server, `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      number: phone,
      mediatype: opts.mediatype,
      media: opts.media,
      caption: opts.caption,
      fileName: opts.fileName,
      ...(delayMs ? { delay: delayMs } : {}),
    }),
  });
}

export async function checkWhatsappNumbers(
  server: EvolutionServer,
  instanceName: string,
  numbers: string[],
): Promise<Array<{ jid: string; exists: boolean; number: string }>> {
  const res = await evoFetch(server, `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ numbers }),
  });
  // Evolution retorna um array
  return (Array.isArray(res) ? res : []) as Array<{ jid: string; exists: boolean; number: string }>;
}

