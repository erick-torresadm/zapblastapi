// ============================================================================
// Evolution webhook envelope parser — SINGLE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// Toda interpretação do FORMATO do payload da Evolution mora aqui. Se a
// Evolution mudar o envelope (nomes de campos, posição do `instance`, formato
// do event) em um update, ajuste APENAS este arquivo — o handler do webhook
// continua igual.
// ============================================================================

export type WaKey = {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
  senderPn?: string;
  participantPn?: string;
  remoteJidAlt?: string;
};

export type EvolutionEventKind =
  | "connection.update"
  | "qrcode.updated"
  | "messages.upsert"
  | "messages.update"
  | "send.message"
  | "presence.update"
  | "unknown";

export type ParsedWebhookEnvelope = {
  /** Raw event string como veio (já em lowercase para comparação). */
  event: string;
  /** Classificação canônica do tipo de evento. */
  kind: EvolutionEventKind;
  /** Nome da instância (chip). */
  instanceName: string;
  /** Payload `data` interno (ou o próprio payload se não houver). */
  data: Record<string, unknown>;
  /** `key` do WhatsApp quando aplicável (mensagens). */
  key: WaKey | null;
  /** `remoteJid` extraído da key, se houver. */
  remoteJid: string;
  /** Parte antes do `@` em remoteJid. */
  jidUser: string;
  /** Parte depois do `@` em remoteJid (s.whatsapp.net, g.us, lid, …). */
  jidDomain: string;
  /** Tipo de chat derivado do domínio do JID. */
  chatType: "user" | "group" | "lid" | "broadcast" | "other";
  /** `fromMe` derivado da key. */
  fromMe: boolean;
};

function classify(event: string): EvolutionEventKind {
  const e = event.toLowerCase();
  if (e.includes("connection.update") || e === "connection_update") return "connection.update";
  if (e.includes("qrcode.updated") || e === "qrcode_updated") return "qrcode.updated";
  if (e.includes("messages.upsert") || e === "messages_upsert") return "messages.upsert";
  if (e.includes("messages.update") || e === "messages_update") return "messages.update";
  if (e.includes("send.message") || e === "send_message") return "send.message";
  if (e.includes("presence.update") || e === "presence_update") return "presence.update";
  return "unknown";
}

/**
 * Normaliza o envelope cru da Evolution para um formato estável.
 * Tolera mudanças de nomes (event/type, instance/instanceName) e diferenças
 * entre v1 e v2.
 */
export function parseWebhookEnvelope(payload: Record<string, unknown>): ParsedWebhookEnvelope {
  const rawEvent = String(payload.event ?? payload.type ?? "");
  const instanceName = String(
    payload.instance
      ?? (payload as { instanceName?: string }).instanceName
      ?? (payload as { instance_name?: string }).instance_name
      ?? "",
  );
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const key = (data as { key?: WaKey }).key ?? null;
  const remoteJid = key?.remoteJid ?? "";
  const jidDomain = remoteJid.includes("@") ? remoteJid.split("@")[1] : "";
  const jidUser = remoteJid.includes("@") ? remoteJid.split("@")[0] : remoteJid;

  let chatType: ParsedWebhookEnvelope["chatType"] = "other";
  if (jidDomain === "s.whatsapp.net" || jidDomain === "c.us") chatType = "user";
  else if (jidDomain === "g.us") chatType = "group";
  else if (jidDomain === "lid") chatType = "lid";
  else if (jidDomain === "broadcast" || jidUser === "status") chatType = "broadcast";

  return {
    event: rawEvent,
    kind: classify(rawEvent),
    instanceName,
    data,
    key,
    remoteJid,
    jidUser,
    jidDomain,
    chatType,
    fromMe: !!key?.fromMe,
  };
}

/** Mapa de `connection.update` state → status local. Trocar aqui se a Evolution renomear. */
export const EVOLUTION_CONNECTION_STATE_MAP: Record<string, "connected" | "disconnected" | "connecting"> = {
  open: "connected",
  close: "disconnected",
  connecting: "connecting",
};
