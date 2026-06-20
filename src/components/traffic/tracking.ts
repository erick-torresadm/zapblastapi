// Helper para tracking client-side (Pixel + GA4) e disparo do evento server-side (CAPI).
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    _zb_anon_id?: string;
  }
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function getAnonId(): string {
  if (typeof window === "undefined") return "";
  if (window._zb_anon_id) return window._zb_anon_id;
  const KEY = "_zb_anon";
  let v = localStorage.getItem(KEY);
  if (!v) {
    v = crypto.randomUUID();
    try { localStorage.setItem(KEY, v); } catch { /* noop */ }
  }
  window._zb_anon_id = v;
  return v;
}

export function trackEvent(slug: string, name: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const eventId = crypto.randomUUID();
  // Facebook Pixel
  try { window.fbq?.("track", name, payload, { eventID: eventId }); } catch { /* noop */ }
  // GA4
  try { window.gtag?.("event", name, payload); } catch { /* noop */ }

  // CAPI server-side (dedupe via eventId)
  const body = {
    slug,
    event_name: name,
    event_id: eventId,
    anonymous_id: getAnonId(),
    fbp: getCookie("_fbp") ?? null,
    fbc: getCookie("_fbc") ?? null,
    ua: navigator.userAgent,
    referrer: document.referrer || null,
    page_url: location.href,
    utm: readUTM(),
    payload,
  };
  // fire-and-forget
  fetch("/api/public/traffic-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

function readUTM(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
    const v = p.get(k);
    if (v) out[k] = v;
  });
  return out;
}
