// Chaves VAPID — a privada vem APENAS de env var no servidor.
// A pública é segura para expor no cliente (uso normal de Web Push).
export const VAPID_PUBLIC_KEY =
  "BOBVhn2W8GoHtB8dEjAKkSVMXtTTyKA54Yu8YFxggpq7jCANd8_D-7xHZCkMunblkUfYBXWtP6jFArC88o9s3S8";
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
