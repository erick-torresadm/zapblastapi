// Chaves VAPID — keypair fixo do projeto.
// A pública é exposta no cliente (uso normal de Web Push); a privada NUNCA sai do servidor.
export const VAPID_PUBLIC_KEY =
  "BFQ4VUaHNRjUi5h_XaNK_zs5LTz076cXff2K4WJVTnCu1_a3wfO2WAr1cbhWMZzq6hIkvmKbZKkzhgOkg6cg8z4";
export const VAPID_PRIVATE_KEY = "Wd7xsqn4E0WY9Trz_Tij2W-YCq5JF34OPE3xH3gCN-o";
export const VAPID_SUBJECT = "mailto:suporte@perseidas.com.br";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendWebPush(sub: PushSubscriptionRow, payload: PushPayload) {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify(payload),
  );
}
