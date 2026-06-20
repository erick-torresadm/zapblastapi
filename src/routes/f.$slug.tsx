// Página pública do funil — rota /f/$slug
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { FunnelBlockRenderer, type Block } from "@/components/traffic/FunnelBlockRenderer";
import { trackEvent } from "@/components/traffic/tracking";

type PublicFunnel = {
  id: string;
  slug: string;
  title: string;
  template: string;
  primary_color: string;
  font_family: string;
  settings: Record<string, unknown>;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  blocks: Block[];
};

const getPublicFunnelFn = createServerFn({ method: "GET" })
  .inputValidator((i: { slug: string }) => ({ slug: String(i.slug).toLowerCase() }))
  .handler(async ({ data }) => {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: result, error } = await sb.rpc("get_published_funnel_by_slug", { _slug: data.slug });
    if (error) throw new Error(error.message);
    return (result as unknown as PublicFunnel | null) ?? null;
  });

export const Route = createFileRoute("/f/$slug")({
  loader: async ({ params }) => {
    const f = await getPublicFunnelFn({ data: { slug: params.slug } });
    if (!f) throw notFound();
    return f;
  },
  head: ({ loaderData }) => {
    const f = loaderData as PublicFunnel | undefined;
    if (!f) return { meta: [{ title: "Funil" }] };
    const title = f.seo_title || f.title;
    const desc = f.seo_description || `Acesse ${f.title}`;
    const meta = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
    ];
    if (f.og_image_url) meta.push({ property: "og:image", content: f.og_image_url });
    return { meta };
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Erro</h1>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">O funil não existe ou ainda não foi publicado.</p>
    </div>
  ),
  component: PublicFunnelPage,
});

function PublicFunnelPage() {
  const f = Route.useLoaderData();
  const settings = (f.settings ?? {}) as { pixel_id?: string; ga4_id?: string; gtm_id?: string };

  // Inject Pixel / GA4 / GTM client-side + dispara PageView
  useEffect(() => {
    if (settings.pixel_id) injectFbPixel(settings.pixel_id);
    if (settings.ga4_id) injectGA4(settings.ga4_id);
    if (settings.gtm_id) injectGTM(settings.gtm_id);
    trackEvent(f.slug, "PageView");
  }, [f.slug, settings.pixel_id, settings.ga4_id, settings.gtm_id]);

  const isLinkbio = f.template === "linkbio";

  return (
    <div
      className="min-h-screen bg-background py-10 px-4"
      style={{ fontFamily: f.font_family }}
    >
      <main className={`mx-auto w-full ${isLinkbio ? "max-w-md" : "max-w-2xl"} space-y-5`}>
        {f.blocks.map((b) => (
          <FunnelBlockRenderer
            key={b.id ?? `${b.type}-${b.position}`}
            block={b}
            funnelSlug={f.slug}
            primaryColor={f.primary_color}
            trackEvent={(name, payload) => trackEvent(f.slug, name, payload)}
          />
        ))}
        <footer className="pt-8 text-center text-[10px] text-muted-foreground/60">
          Feito com ZapBlast
        </footer>
      </main>
    </div>
  );
}

function injectFbPixel(id: string) {
  if (document.getElementById("fb-pixel")) return;
  const s = document.createElement("script");
  s.id = "fb-pixel";
  s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');`;
  document.head.appendChild(s);
}

function injectGA4(id: string) {
  if (document.getElementById("ga4")) return;
  const s = document.createElement("script");
  s.id = "ga4";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  const s2 = document.createElement("script");
  s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');`;
  document.head.appendChild(s2);
}

function injectGTM(id: string) {
  if (document.getElementById("gtm")) return;
  const s = document.createElement("script");
  s.id = "gtm";
  s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
  document.head.appendChild(s);
}
