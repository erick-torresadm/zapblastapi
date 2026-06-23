import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { subscribePushFn, unsubscribePushFn } from "@/lib/push.functions";

// Chave VAPID pública — segura para expor no cliente
const VAPID_PUBLIC_KEY =
  "BFQ4VUaHNRjUi5h_XaNK_zs5LTz076cXff2K4WJVTnCu1_a3wfO2WAr1cbhWMZzq6hIkvmKbZKkzhgOkg6cg8z4";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushStatus = "unsupported" | "denied" | "granted" | "default" | "loading";

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const subscribe = useServerFn(subscribePushFn);
  const unsubscribe = useServerFn(unsubscribePushFn);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const perm = Notification.permission as PushStatus;
    setStatus(perm);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
      // Keep-alive: re-upsert pra refrescar last_seen_at e garantir que o servidor
      // ainda enxerga essa inscrição, mesmo que a sessão tenha expirado e voltado.
      if (sub && perm === "granted") {
        const json = sub.toJSON();
        try {
          await subscribe({
            data: {
              endpoint: sub.endpoint,
              p256dh: json.keys?.p256dh ?? "",
              auth: json.keys?.auth ?? "",
              user_agent: navigator.userAgent,
            },
          });
        } catch (_) {
          // Se falhar (provavelmente 401 por token ainda hidratando), tenta de novo no próximo mount
        }
      }
    } catch {
      setSubscribed(false);
    }
  }, [subscribe]);

  useEffect(() => { refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (typeof window === "undefined") throw new Error("Indisponível");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Seu navegador não suporta push.");
    }
    const reg =
      (await navigator.serviceWorker.getRegistration("/push-sw.js")) ||
      (await navigator.serviceWorker.register("/push-sw.js"));
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    setStatus(perm as PushStatus);
    if (perm !== "granted") throw new Error("Permissão negada.");
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON();
    await subscribe({
      data: {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent,
      },
    });
    setSubscribed(true);
  }, [subscribe]);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      try { await unsubscribe({ data: { endpoint: sub.endpoint } }); } catch (_) {}
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }, [unsubscribe]);

  return { status, subscribed, enable, disable, refresh };
}
