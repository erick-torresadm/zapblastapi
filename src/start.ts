import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Injeta headers de segurança em todas as respostas HTML/JSON
const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const res = await next();
  if (!(res instanceof Response)) return res;
  // Não mexer em assets estáticos
  const url = new URL(request.url);
  const isAsset = /\.(js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname);
  if (isAsset) return res;

  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // CSP permissiva o bastante para Lovable/Supabase/Evolution funcionarem,
  // mas bloqueando frame-ancestors e mixed-content.
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self' https: data: blob:",
        "img-src 'self' https: data: blob:",
        "media-src 'self' https: data: blob:",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
        "style-src 'self' 'unsafe-inline' https:",
        "font-src 'self' https: data:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));
