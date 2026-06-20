// Renderer público de blocos do funil — usado tanto no preview do editor quanto na página pública.
import { useState } from "react";
import { toast } from "sonner";

export type Block = { id?: string; type: string; position: number; props: Record<string, unknown> };

function getProp<T>(b: Block, key: string, fallback: T): T {
  const v = b.props?.[key];
  return (v === undefined || v === null ? fallback : v) as T;
}

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function FunnelBlockRenderer({
  block,
  funnelSlug,
  primaryColor,
  trackEvent,
}: {
  block: Block;
  funnelSlug: string;
  primaryColor: string;
  trackEvent: (name: string, payload?: Record<string, unknown>) => void;
}) {
  const t = block.type;

  if (t === "headline") {
    return (
      <h1
        className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight"
        style={{ textAlign: getProp(block, "align", "center") as "left" | "center" | "right", color: getProp(block, "color", "inherit") }}
      >
        {getProp(block, "text", "Headline")}
      </h1>
    );
  }

  if (t === "text") {
    return (
      <p
        className="text-base sm:text-lg leading-relaxed text-foreground/80 whitespace-pre-wrap"
        style={{ textAlign: getProp(block, "align", "left") as "left" | "center" | "right" }}
      >
        {getProp(block, "text", "")}
      </p>
    );
  }

  if (t === "image") {
    const url = getProp(block, "url", "");
    if (!url) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Imagem (cole uma URL)</div>;
    return <img src={url} alt={getProp(block, "alt", "")} className="w-full rounded-lg" />;
  }

  if (t === "video") {
    const url = getProp(block, "url", "");
    const yid = youTubeId(url);
    if (!yid) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Vídeo (cole link do YouTube)</div>;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${yid}`}
          title="Vídeo"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (t === "button-whatsapp") {
    const phone = digitsOnly(getProp(block, "phone", ""));
    const msg = encodeURIComponent(getProp(block, "message", "Olá! Vim pelo link."));
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : "#";
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackEvent("Contact", { channel: "whatsapp" })}
        className="block w-full rounded-lg px-6 py-4 text-center text-base font-semibold text-white shadow-sm transition hover:opacity-90"
        style={{ background: primaryColor }}
      >
        {getProp(block, "label", "Falar no WhatsApp")}
      </a>
    );
  }

  if (t === "button-link") {
    return (
      <a
        href={getProp(block, "url", "#")}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackEvent("ClickButton", { label: getProp(block, "label", "") })}
        className="block w-full rounded-lg border-2 px-6 py-4 text-center text-base font-semibold transition hover:opacity-90"
        style={{ borderColor: primaryColor, color: primaryColor }}
      >
        {getProp(block, "label", "Acessar")}
      </a>
    );
  }

  if (t === "button-agenda") {
    const slug = getProp(block, "slug", "");
    const url = slug ? `/agenda/${slug}` : "#";
    return (
      <a
        href={url}
        onClick={() => trackEvent("Schedule")}
        className="block w-full rounded-lg px-6 py-4 text-center text-base font-semibold text-white shadow-sm transition hover:opacity-90"
        style={{ background: primaryColor }}
      >
        {getProp(block, "label", "Agendar horário")}
      </a>
    );
  }

  if (t === "form") {
    return <LeadForm block={block} funnelSlug={funnelSlug} primaryColor={primaryColor} onSubmitted={() => trackEvent("Lead")} />;
  }

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

  if (t === "spacer") {
    return <div style={{ height: `${getProp(block, "height", 24)}px` }} />;
  }

  return <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Bloco desconhecido: {t}</div>;
}

function LeadForm({
  block,
  funnelSlug,
  primaryColor,
  onSubmitted,
}: {
  block: Block;
  funnelSlug: string;
  primaryColor: string;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const fields = getProp(block, "fields", ["name", "phone"]) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const utm = readUTM();
      const res = await fetch("/api/public/traffic-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: funnelSlug, name, phone, email, utm }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(true);
      onSubmitted();
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
      {getProp<string>(block, "title", "") ? (
        <h3 className="text-lg font-semibold">{getProp(block, "title", "")}</h3>
      ) : null}
      {fields.includes("name") && (
        <input
          required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
      {fields.includes("phone") && (
        <input
          required value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp com DDD"
          inputMode="tel"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
      {fields.includes("email") && (
        <input
          required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Seu e-mail" type="email"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
      <button
        type="submit" disabled={busy}
        className="w-full rounded-md px-4 py-3 text-center text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: primaryColor }}
      >
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
