// Página pública do funil interativo — rota /f/$slug — multi-step com branching.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { FunnelBlockRenderer, type Block } from "@/components/traffic/FunnelBlockRenderer";
import { trackEvent } from "@/components/traffic/tracking";

type Step = {
  id: string;
  position: number;
  name: string;
  type: string;
  settings: Record<string, unknown>;
  next_step_id: string | null;
  blocks: Block[];
};
type LogicRule = {
  id: string;
  step_id: string;
  block_id: string | null;
  condition: { field_key?: string; op?: string; value?: unknown };
  next_step_id: string | null;
  redirect_url: string | null;
  position: number;
};
type PublicFunnel = {
  id: string; slug: string; title: string; template: string;
  primary_color: string; font_family: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  seo_title: string | null; seo_description: string | null;
  og_image_url: string | null; redirect_url: string | null;
  steps: Step[];
  logic: LogicRule[];
  legacy_blocks: Block[];
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
    return (result ?? null) as any;
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
    const meta: any[] = [
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
  const f = Route.useLoaderData() as PublicFunnel;
  const settings = (f.settings ?? {}) as { pixel_id?: string; ga4_id?: string; gtm_id?: string };

  // se não houver steps (funil legado), monta um "step único" com legacy_blocks
  const steps: Step[] = useMemo(() => {
    if (f.steps && f.steps.length > 0) return f.steps;
    if (f.legacy_blocks && f.legacy_blocks.length > 0) {
      return [{ id: "legacy", position: 0, name: "Único", type: "intro", settings: {}, next_step_id: null, blocks: f.legacy_blocks }];
    }
    return [];
  }, [f]);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<number[]>([0]);

  // Pixel/GA/GTM + PageView no primeiro render
  useEffect(() => {
    const pid = isValidFbPixel(settings.pixel_id) ? settings.pixel_id! : null;
    const gid = isValidGA4(settings.ga4_id) ? settings.ga4_id! : null;
    const tid = isValidGTM(settings.gtm_id) ? settings.gtm_id! : null;
    if (pid) injectFbPixel(pid);
    if (gid) injectGA4(gid);
    if (tid) injectGTM(tid);
    trackEvent(f.slug, "PageView");
  }, [f.slug, settings.pixel_id, settings.ga4_id, settings.gtm_id]);

  // ViewStep
  useEffect(() => {
    const step = steps[currentStepIdx];
    if (step) trackEvent(f.slug, "ViewStep", { step_id: step.id, step_name: step.name });
  }, [currentStepIdx, f.slug, steps]);

  const currentStep = steps[currentStepIdx];

  function evalRule(rule: LogicRule): boolean {
    const fk = rule.condition?.field_key;
    if (!fk) return true;
    const val = answers[fk];
    const target = rule.condition.value;
    switch (rule.condition.op ?? "eq") {
      case "eq": return val === target;
      case "neq": return val !== target;
      case "in": return Array.isArray(target) && (target as unknown[]).includes(val);
      case "contains": return typeof val === "string" && typeof target === "string" && val.includes(target);
      default: return false;
    }
  }

  function goNext() {
    if (!currentStep) return;
    // 1. avalia regras de branching deste step
    const matching = f.logic.filter((r) => r.step_id === currentStep.id).find(evalRule);
    if (matching) {
      if (matching.redirect_url) { window.location.href = matching.redirect_url; return; }
      if (matching.next_step_id) {
        const idx = steps.findIndex((s) => s.id === matching.next_step_id);
        if (idx >= 0) { setHistory((h) => [...h, idx]); setCurrentStepIdx(idx); return; }
      }
    }
    // 2. fallback: next_step_id do step
    if (currentStep.next_step_id) {
      const idx = steps.findIndex((s) => s.id === currentStep.next_step_id);
      if (idx >= 0) { setHistory((h) => [...h, idx]); setCurrentStepIdx(idx); return; }
    }
    // 3. próximo na ordem
    if (currentStepIdx + 1 < steps.length) {
      const idx = currentStepIdx + 1;
      setHistory((h) => [...h, idx]); setCurrentStepIdx(idx); return;
    }
    // 4. fim: redirect global
    if (f.redirect_url) window.location.href = f.redirect_url;
  }

  function goBack() {
    if (history.length <= 1) return;
    const next = [...history]; next.pop();
    setHistory(next); setCurrentStepIdx(next[next.length - 1]);
  }

  if (!currentStep) {
    return <div className="mx-auto max-w-md p-8 text-center"><p className="text-sm text-muted-foreground">Funil vazio.</p></div>;
  }

  const progress = ((currentStepIdx + 1) / steps.length) * 100;
  const showProgress = steps.length > 1 && currentStep.type !== "intro";

  const ctx = {
    funnelSlug: f.slug,
    primaryColor: f.primary_color,
    trackEvent: (name: string, payload?: Record<string, unknown>) => trackEvent(f.slug, name, payload),
    onAnswer: (fk: string, v: unknown) => setAnswers((a) => ({ ...a, [fk]: v })),
    onNext: goNext,
    answers,
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: f.font_family }}>
      {showProgress && (
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              {history.length > 1 && (
                <button onClick={goBack} className="text-sm text-muted-foreground hover:text-foreground">←</button>
              )}
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress}%`, background: f.primary_color }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{currentStepIdx + 1}/{steps.length}</span>
            </div>
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-10">
        {currentStep.blocks.map((b, i) => (
          <FunnelBlockRenderer key={b.id ?? `${b.type}-${i}`} block={b} ctx={ctx} />
        ))}
        {/* botão next padrão se não houver button-next nem form */}
        {!currentStep.blocks.some((b) => b.type === "button-next" || b.type === "form" || (b.type === "choice" && (b.props as any)?.autoNext !== false)) && (
          <button onClick={goNext}
            className="block w-full rounded-lg px-6 py-4 text-center text-base font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ background: f.primary_color }}>
            Continuar 👉
          </button>
        )}
        <footer className="pt-8 text-center text-[10px] text-muted-foreground/60">Feito com Perseidas</footer>
      </main>
    </div>
  );
}

function injectFbPixel(id: string) {
  if (document.getElementById("fb-pixel")) return;
  const s = document.createElement("script"); s.id = "fb-pixel";
  s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');`;
  document.head.appendChild(s);
}
function injectGA4(id: string) {
  if (document.getElementById("ga4")) return;
  const s = document.createElement("script"); s.id = "ga4"; s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`; document.head.appendChild(s);
  const s2 = document.createElement("script");
  s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');`;
  document.head.appendChild(s2);
}
function injectGTM(id: string) {
  if (document.getElementById("gtm")) return;
  const s = document.createElement("script"); s.id = "gtm";
  s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
  document.head.appendChild(s);
}
