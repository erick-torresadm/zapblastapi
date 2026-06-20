// Renderer público de blocos do funil — usado no preview e na página pública multi-step.
import { useState, useEffect } from "react";
import { toast } from "sonner";

export type Block = {
  id?: string;
  type: string;
  position: number;
  props: Record<string, unknown>;
  field_key?: string | null;
};

function getProp<T>(b: Block, key: string, fallback: T): T {
  const v = b.props?.[key];
  return (v === undefined || v === null ? fallback : v) as T;
}

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

function videoEmbed(url: string): string | null {
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export type RendererCtx = {
  funnelSlug: string;
  primaryColor: string;
  trackEvent: (name: string, payload?: Record<string, unknown>) => void;
  onAnswer?: (fieldKey: string, value: unknown) => void;
  onNext?: (payload?: { redirect?: string; nextStepId?: string }) => void;
  answers?: Record<string, unknown>;
  preview?: boolean;
};

export function FunnelBlockRenderer({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const t = block.type;

  if (t === "headline") {
    const size = getProp(block, "size", "xl") as string;
    const cls = size === "2xl" ? "text-4xl sm:text-5xl md:text-6xl" :
                size === "lg" ? "text-2xl sm:text-3xl" :
                "text-3xl sm:text-4xl md:text-5xl";
    return (
      <h1 className={`${cls} font-bold leading-tight`}
        style={{ textAlign: getProp(block, "align", "center") as any, color: getProp(block, "color", "inherit") }}>
        {getProp(block, "text", "Headline")}
      </h1>
    );
  }

  if (t === "text") {
    return (
      <p className="text-base sm:text-lg leading-relaxed text-foreground/80 whitespace-pre-wrap"
        style={{ textAlign: getProp(block, "align", "left") as any }}>
        {getProp(block, "text", "")}
      </p>
    );
  }

  if (t === "image") {
    const url = getProp(block, "url", "");
    if (!url) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Imagem (cole uma URL)</div>;
    return <img src={url} alt={getProp(block, "alt", "")} className={`w-full ${getProp(block, "rounded", true) ? "rounded-lg" : ""}`} />;
  }

  if (t === "divider") return <hr className="border-border" />;
  if (t === "spacer") return <div style={{ height: `${getProp(block, "height", 24)}px` }} />;

  if (t === "video") {
    const embed = videoEmbed(getProp(block, "url", ""));
    if (!embed) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Vídeo (cole link YouTube/Vimeo)</div>;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <iframe className="h-full w-full" src={embed} title="Vídeo" frameBorder={0}
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  if (t === "audio") {
    const url = getProp(block, "url", "");
    if (!url) return <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Áudio (cole URL)</div>;
    return <audio src={url} controls className="w-full" preload="metadata" />;
  }

  if (t === "choice") return <ChoiceBlock block={block} ctx={ctx} />;
  if (t === "multi-choice") return <MultiChoiceBlock block={block} ctx={ctx} />;
  if (t === "input") return <InputBlock block={block} ctx={ctx} />;
  if (t === "loading") return <LoadingBlock block={block} ctx={ctx} />;
  if (t === "progress") {
    const v = Math.max(0, Math.min(100, Number(getProp(block, "value", 50))));
    return (
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${v}%`, background: ctx.primaryColor }} />
      </div>
    );
  }
  if (t === "countdown") return <CountdownBlock block={block} ctx={ctx} />;
  if (t === "html") {
    if (ctx.preview) return <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">HTML custom (preview desativado)</div>;
    return <div dangerouslySetInnerHTML={{ __html: String(getProp(block, "html", "")) }} />;
  }

  if (t === "button-next") {
    const style = getProp(block, "style", "primary") as string;
    const cls = style === "outline"
      ? "border-2 bg-transparent"
      : "text-white shadow-sm";
    const styleObj = style === "outline"
      ? { borderColor: ctx.primaryColor, color: ctx.primaryColor }
      : { background: ctx.primaryColor };
    return (
      <button type="button" onClick={() => { ctx.trackEvent("ClickNext"); ctx.onNext?.(); }}
        className={`block w-full rounded-lg px-6 py-4 text-center text-base font-semibold transition hover:opacity-90 ${cls}`}
        style={styleObj}>
        {getProp(block, "label", "Continuar")}
      </button>
    );
  }

  if (t === "button-whatsapp") {
    const phone = digitsOnly(getProp(block, "phone", ""));
    const msg = encodeURIComponent(getProp(block, "message", "Olá!"));
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : "#";
    return (
      <a href={url} target="_blank" rel="noreferrer"
        onClick={() => ctx.trackEvent("Contact", { channel: "whatsapp" })}
        className="block w-full rounded-lg px-6 py-4 text-center text-base font-semibold text-white shadow-sm transition hover:opacity-90"
        style={{ background: ctx.primaryColor }}>
        {getProp(block, "label", "Falar no WhatsApp")}
      </a>
    );
  }

  if (t === "button-link") {
    return (
      <a href={getProp(block, "url", "#")} target={getProp(block, "target", "_blank")} rel="noreferrer"
        onClick={() => ctx.trackEvent("ClickButton", { label: getProp(block, "label", "") })}
        className="block w-full rounded-lg border-2 px-6 py-4 text-center text-base font-semibold transition hover:opacity-90"
        style={{ borderColor: ctx.primaryColor, color: ctx.primaryColor }}>
        {getProp(block, "label", "Acessar")}
      </a>
    );
  }

  if (t === "button-agenda") {
    const slug = getProp(block, "slug", "");
    return (
      <a href={slug ? `/agenda/${slug}` : "#"} onClick={() => ctx.trackEvent("Schedule")}
        className="block w-full rounded-lg px-6 py-4 text-center text-base font-semibold text-white shadow-sm"
        style={{ background: ctx.primaryColor }}>
        {getProp(block, "label", "Agendar horário")}
      </a>
    );
  }

  if (t === "form") return <LeadForm block={block} ctx={ctx} />;

  if (t === "testimonial") {
    return (
      <div className="rounded-lg bg-muted/40 p-6">
        <p className="italic text-foreground/80">"{getProp(block, "text", "")}"</p>
        <p className="mt-3 text-sm font-semibold">— {getProp(block, "author", "Cliente")}</p>
      </div>
    );
  }

  if (t === "faq") {
    const items = getProp(block, "items", [] as Array<{ q: string; a: string }>);
    return (
      <div className="space-y-3">
        {items.map((it, i) => (
          <details key={i} className="rounded-lg border p-4">
            <summary className="cursor-pointer font-semibold">{it.q}</summary>
            <p className="mt-2 text-sm text-foreground/80">{it.a}</p>
          </details>
        ))}
      </div>
    );
  }

  return <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Bloco desconhecido: {t}</div>;
}

// ============ CHOICE (escolha única estilo Inlead) ============
function ChoiceBlock({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const fieldKey = block.field_key ?? `choice_${block.id ?? block.position}`;
  const options = getProp(block, "options", [] as Array<{ value: string; label: string; image?: string }>);
  const layout = getProp(block, "layout", "grid") as "grid" | "list";
  const autoNext = getProp(block, "autoNext", true);
  const current = ctx.answers?.[fieldKey] as string | undefined;

  function pick(v: string) {
    ctx.onAnswer?.(fieldKey, v);
    ctx.trackEvent("Answer", { field: fieldKey, value: v });
    if (autoNext) setTimeout(() => ctx.onNext?.(), 250);
  }

  const label = getProp(block, "label", "");
  return (
    <div className="space-y-3">
      {label && <p className="text-base font-medium text-center">{label}</p>}
      <div className={layout === "grid" ? "grid grid-cols-2 gap-3" : "space-y-2"}>
        {options.map((o) => {
          const active = current === o.value;
          return (
            <button key={o.value} type="button" onClick={() => pick(o.value)}
              className={`flex ${layout === "grid" ? "flex-col items-center" : "items-center gap-3"} rounded-xl border-2 p-4 transition hover:opacity-90 ${active ? "ring-2" : "border-border"}`}
              style={active ? { borderColor: ctx.primaryColor, boxShadow: `0 0 0 1px ${ctx.primaryColor}` } : undefined}>
              {o.image && <img src={o.image} alt={o.label} className={layout === "grid" ? "h-24 w-24 object-cover rounded-lg mb-2" : "h-12 w-12 object-cover rounded"} />}
              <span className="font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============ MULTI-CHOICE ============
function MultiChoiceBlock({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const fieldKey = block.field_key ?? `multi_${block.id ?? block.position}`;
  const options = getProp(block, "options", [] as Array<{ value: string; label: string }>);
  const current = (ctx.answers?.[fieldKey] as string[]) ?? [];

  function toggle(v: string) {
    const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
    ctx.onAnswer?.(fieldKey, next);
  }

  const label = getProp(block, "label", "");
  return (
    <div className="space-y-3">
      {label && <p className="text-base font-medium">{label}</p>}
      <div className="space-y-2">
        {options.map((o) => {
          const active = current.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 transition hover:opacity-90 ${active ? "ring-2" : "border-border"}`}
              style={active ? { borderColor: ctx.primaryColor, boxShadow: `0 0 0 1px ${ctx.primaryColor}` } : undefined}>
              <span className={`h-5 w-5 rounded border-2 flex items-center justify-center ${active ? "" : "border-muted-foreground"}`}
                style={active ? { background: ctx.primaryColor, borderColor: ctx.primaryColor } : undefined}>
                {active && <span className="text-white text-xs">✓</span>}
              </span>
              <span className="font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============ INPUT ============
function InputBlock({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const fieldKey = block.field_key ?? `input_${block.id ?? block.position}`;
  const inputType = getProp(block, "inputType", "text") as string;
  const value = (ctx.answers?.[fieldKey] as string) ?? "";
  const label = getProp(block, "label", "");
  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <input
        type={inputType === "phone" ? "tel" : inputType}
        inputMode={inputType === "phone" ? "tel" : inputType === "number" ? "numeric" : "text"}
        placeholder={getProp(block, "placeholder", "")}
        value={value}
        onChange={(e) => ctx.onAnswer?.(fieldKey, e.target.value)}
        className="w-full rounded-lg border-2 bg-background px-4 py-3 text-base"
      />
    </div>
  );
}

// ============ LOADING ============
function LoadingBlock({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const steps = getProp(block, "steps", ["Processando…"]);
  const duration = Number(getProp(block, "durationMs", 3000));
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (ctx.preview) return;
    const stepMs = duration / steps.length;
    const stepTimer = setInterval(() => setStepIdx((i) => Math.min(i + 1, steps.length - 1)), stepMs);
    const start = Date.now();
    const pctTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      setPct(Math.min(100, (elapsed / duration) * 100));
    }, 50);
    const done = setTimeout(() => ctx.onNext?.(), duration);
    return () => { clearInterval(stepTimer); clearInterval(pctTimer); clearTimeout(done); };
  }, [ctx, duration, steps.length]);

  return (
    <div className="space-y-4 text-center py-8">
      <p className="text-lg font-semibold">{getProp(block, "text", "Carregando…")}</p>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: ctx.primaryColor }} />
      </div>
      <p className="text-sm text-muted-foreground">{steps[stepIdx]}</p>
    </div>
  );
}

// ============ COUNTDOWN ============
function CountdownBlock({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const minutes = Number(getProp(block, "minutes", 15));
  const [secs, setSecs] = useState(minutes * 60);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <div className="text-center py-2">
      <p className="text-sm text-muted-foreground">{getProp(block, "label", "Oferta termina em:")}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: ctx.primaryColor }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </p>
    </div>
  );
}

// ============ FORM ============
function LeadForm({ block, ctx }: { block: Block; ctx: RendererCtx }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const fields = getProp(block, "fields", ["name", "phone"]) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || ctx.preview) { if (ctx.preview) setSent(true); return; }
    setBusy(true);
    try {
      const utm = readUTM();
      const res = await fetch("/api/public/traffic-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: ctx.funnelSlug, name, phone, email, utm,
          answers: ctx.answers ?? {},
          completed: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(true);
      ctx.trackEvent("Lead");
      setTimeout(() => ctx.onNext?.(), 600);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível enviar");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg bg-muted/40 p-6 text-center">
        <p className="text-lg font-semibold">{getProp(block, "successTitle", "Obrigado!")}</p>
        <p className="mt-1 text-sm text-foreground/70">{getProp(block, "successText", "Em breve entraremos em contato.")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-card p-5">
      {getProp<string>(block, "title", "") && <h3 className="text-lg font-semibold">{getProp(block, "title", "")}</h3>}
      {fields.includes("name") && (
        <input required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      )}
      {fields.includes("phone") && (
        <input required value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp com DDD" inputMode="tel"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      )}
      {fields.includes("email") && (
        <input required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Seu e-mail" type="email"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      )}
      <button type="submit" disabled={busy}
        className="w-full rounded-md px-4 py-3 text-center text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: ctx.primaryColor }}>
        {busy ? "Enviando…" : getProp(block, "submitLabel", "Enviar")}
      </button>
    </form>
  );
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
