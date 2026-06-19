import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Zap, ShieldCheck, Flame, ShoppingCart, MessageSquare, BarChart3,
  ArrowRight, Check, Sparkles, Workflow, Inbox, Bot, Users,
} from "lucide-react";
import { Meteors } from "@/components/magicui/meteors";
import { GridPattern } from "@/components/magicui/grid-pattern";
import { BorderBeam } from "@/components/magicui/border-beam";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Logo } from "@/components/Logo";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ThemeToggle } from "@/lib/theme";
import { LangSwitcher, T, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SITE_URL = "https://zapblastapi.lovable.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Perseidas — Disparos em massa, Chatbot e CRM no WhatsApp sem ban" },
      { name: "description", content: "Plataforma all-in-one para WhatsApp: disparos em massa anti-ban, fluxos por palavra-chave, CRM multi-atendente e aquecimento de chips. 10 dias grátis no Pro, sem cartão." },
      { name: "keywords", content: "disparo em massa whatsapp, chatbot whatsapp, crm whatsapp, anti-ban whatsapp, evolution api, aquecimento de chip, automação whatsapp" },
      { name: "author", content: "Perseidas" },
      { property: "og:title", content: "Perseidas — Disparos, Chatbot e CRM no WhatsApp sem ban" },
      { property: "og:description", content: "Disparo + fluxos por palavra-chave + CRM multi-atendente + anti-ban. Tudo num só painel." },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:locale:alternate", content: "en_US" },
      { property: "og:locale:alternate", content: "es_ES" },
      { property: "og:locale:alternate", content: "fr_FR" },
      { name: "twitter:title", content: "Perseidas — Disparos, Chatbot e CRM no WhatsApp" },
      { name: "twitter:description", content: "Disparo + fluxos + CRM + anti-ban. Tudo num só painel." },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      { rel: "alternate", hrefLang: "pt-BR", href: `${SITE_URL}/` },
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/` },
      { rel: "alternate", hrefLang: "es", href: `${SITE_URL}/` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/` },
      { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/` },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Perseidas",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: "Disparo em massa anti-ban, fluxos por palavra-chave, CRM multi-atendente e aquecimento de chips para WhatsApp.",
          offers: [
            { "@type": "Offer", name: "Starter", price: "49.00", priceCurrency: "BRL" },
            { "@type": "Offer", name: "Pro",     price: "149.00", priceCurrency: "BRL" },
            { "@type": "Offer", name: "Scale",   price: "399.00", priceCurrency: "BRL" },
          ],
          aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: "127" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            { "@type": "Question", name: "Meu chip vai ser banido?", acceptedAnswer: { "@type": "Answer", text: "Nenhuma plataforma garante 100%. Reduzimos drasticamente o risco com aquecimento, spintax, delays humanos e circuit breaker. Chips bem aquecidos > 90% de sobrevida em 30 dias." } },
            { "@type": "Question", name: "Preciso da Evolution API?", acceptedAnswer: { "@type": "Answer", text: "Sim — você pode usar a sua ou contratar uma da nossa lista de provedores recomendados." } },
            { "@type": "Question", name: "Posso comprar chips dentro da plataforma?", acceptedAnswer: { "@type": "Answer", text: "Sim, no Marketplace. Chips virtuais BR a partir de R$ 7,90 com saldo pré-pago." } },
            { "@type": "Question", name: "Aceita Pix?", acceptedAnswer: { "@type": "Answer", text: "Sim — PIX e cartão de crédito. No plano anual o PIX é preferencial (à vista com 30% de desconto). Integração via Efí Bank." } },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER — floating pill */}
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-border/60 bg-background/70 px-3 py-2 shadow-lg shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
          <div className="pl-2">
            <Logo to="/" size="sm" />
          </div>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">{t("nav.features")}</a>
            <a href="#how" className="transition-colors hover:text-foreground">{t("nav.how")}</a>
            <a href="#anti-ban" className="transition-colors hover:text-foreground">{t("nav.antiban")}</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">{t("nav.pricing")}</a>
            <a href="#faq" className="transition-colors hover:text-foreground">{t("nav.faq")}</a>
          </nav>

          <div className="flex items-center gap-2">
            <LangSwitcher />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/auth">{t("nav.signin")}</Link></Button>
            <Button asChild size="sm" className="bg-gradient-to-br from-primary to-primary-glow shadow-glow">
              <Link to="/auth">{t("nav.signup")}</Link>
            </Button>
          </div>
        </div>
      </header>
      <div aria-hidden className="h-20" />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <GridPattern />
        <Meteors number={25} />
        <div className="container relative mx-auto px-4 pb-24 pt-20 text-center md:pt-32">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur">
            <Sparkles className="h-3 w-3" />
            {t("hero.badge")}
          </div>
          <h1 className="mx-auto max-w-4xl font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            {t("hero.title1")} <br />
            <span className="text-aurora">{t("hero.title2")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            <T k="hero.subtitle" />
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-to-br from-primary to-primary-glow shadow-glow">
              <Link to="/auth">
                {t("hero.cta_primary")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border/60 bg-card/40 backdrop-blur">
              <a href="#features">{t("hero.cta_secondary")}</a>
            </Button>
          </div>

          {/* metrics */}
          <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border/60 bg-border/40 md:grid-cols-4">
            {[
              { v: 99.4, suf: "%", l: t("metrics.uptime") },
              { v: 12, suf: "M+", l: t("metrics.sent") },
              { v: 87, suf: "%", l: t("metrics.lessbans") },
              { v: 4200, suf: "+", l: t("metrics.flows") },
            ].map((m) => (
              <div key={m.l} className="bg-card/60 p-6 backdrop-blur">
                <div className="font-display text-3xl font-bold text-foreground">
                  <NumberTicker value={m.v} suffix={m.suf} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("features.kicker")}</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
            {t("features.title")}
          </h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl gap-4 md:grid-cols-3">
          {/* Big card — anti-ban */}
          <div className="relative col-span-1 overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-7 backdrop-blur md:col-span-2 md:row-span-2">
            <BorderBeam size={250} duration={10} />
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h3 className="mt-4 font-display text-2xl font-semibold">{t("features.antiban.title")}</h3>
            <p className="mt-2 text-muted-foreground">{t("features.antiban.desc")}</p>
            <ul className="mt-6 grid gap-2 text-sm">
              {["features.antiban.b1","features.antiban.b2","features.antiban.b3","features.antiban.b4","features.antiban.b5"].map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <FeatureCard icon={Workflow} title={t("features.flows.title")} desc={t("features.flows.desc")} />
          <FeatureCard icon={Inbox} title={t("features.crm.title")} desc={t("features.crm.desc")} />
          <FeatureCard icon={Bot} title={t("features.bot.title")} desc={t("features.bot.desc")} />
          <FeatureCard icon={Users} title={t("features.team.title")} desc={t("features.team.desc")} />
          <FeatureCard icon={Flame} title={t("features.warmup.title")} desc={t("features.warmup.desc")} />
          <FeatureCard icon={ShoppingCart} title={t("features.market.title")} desc={t("features.market.desc")} />
          <FeatureCard icon={MessageSquare} title={t("features.spintax.title")} desc={t("features.spintax.desc")} />
          <FeatureCard icon={BarChart3} title={t("features.reports.title")} desc={t("features.reports.desc")} />
        </div>
      </section>

      {/* HOW IT WORKS — animated mockups */}
      <HowItWorks />

      {/* ANTI-BAN STRIP */}
      <section id="anti-ban" className="border-y border-border/60 bg-card/30 py-24">
        <div className="container mx-auto grid gap-12 px-4 md:grid-cols-2 md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("antiban.kicker")}</div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight">
              Evolution API ≠ <span className="text-muted-foreground/60 line-through">whatsapp-web.js</span>
            </h2>
            <p className="mt-4 text-muted-foreground">{t("antiban.desc")}</p>
            <Button asChild variant="outline" className="mt-6 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">
              <Link to="/auth">{t("antiban.cta")} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-3">
            <CompareRow label="Fingerprint" a="❌ Detectável" b="✅ Protocolo nativo" />
            <CompareRow label="Presence / typing" a="❌ Simulado via DOM" b="✅ Nativo" />
            <CompareRow label="Reconexão" a="❌ Reload visível" b="✅ Silenciosa" />
            <CompareRow label="RAM / instância" a="~300 MB" b="~30 MB" />
            <CompareRow label="Risco de ban" a="🔴 Alto" b="🟢 Baixo*" />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("pricing.kicker")}</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">{t("pricing.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("pricing.subtitle")}</p>
        </div>
        <PricingBlock />
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-card/30 py-24">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("faq.kicker")}</div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight">{t("faq.title")}</h2>
          </div>
          <div className="mt-10 space-y-3">
            {[
              { q: t("faq.q1"), a: t("faq.a1") },
              { q: t("faq.q2"), a: t("faq.a2") },
              { q: t("faq.q3"), a: t("faq.a3") },
              { q: t("faq.q4"), a: t("faq.a4") },
            ].map((f) => (
              <details key={f.q} className="group rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                  {f.q}
                  <span className="text-primary transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-card p-12 text-center shadow-glow">
          <BorderBeam size={400} duration={12} />
          <Meteors number={15} />
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">{t("cta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            <T k="cta.desc" />
          </p>
          <Button asChild size="lg" className="mt-8 bg-gradient-to-br from-primary to-primary-glow shadow-glow">
            <Link to="/auth">
              {t("cta.button")} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> {t("footer.copy")}
          </div>
          <div className="text-xs">{t("footer.disclaimer")}</div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-primary/40 hover:shadow-glow">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 rounded-full border border-border/60 bg-card/60 px-5 py-3 backdrop-blur">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm text-muted-foreground/80">{a}</div>
      <div className="text-sm font-medium text-foreground">{b}</div>
    </div>
  );
}

const PLAN_KEYS = [
  { name: "Starter", monthly: 49,  fkeys: ["plans.starter.f1","plans.starter.f2","plans.starter.f3","plans.starter.f4","plans.starter.f5","plans.starter.f6"] },
  { name: "Pro",     monthly: 149, highlight: true, fkeys: ["plans.pro.f1","plans.pro.f2","plans.pro.f3","plans.pro.f4","plans.pro.f5","plans.pro.f6","plans.pro.f7"] },
  { name: "Scale",   monthly: 399, fkeys: ["plans.scale.f1","plans.scale.f2","plans.scale.f3","plans.scale.f4","plans.scale.f5","plans.scale.f6","plans.scale.f7","plans.scale.f8"] },
];

function PricingBlock() {
  const { t } = useI18n();
  const [cycle, setCycle] = useState<"annual" | "monthly">("annual");
  return (
    <>
      <div className="mt-10 flex justify-center">
        <div role="tablist" className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1 backdrop-blur">
          <button
            role="tab"
            aria-selected={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={cn(
              "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors",
              cycle === "annual" ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("pricing.annual")}
            <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">{t("pricing.discount")}</span>
          </button>
          <button
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors",
              cycle === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("pricing.monthly")}
          </button>
        </div>
      </div>
      <div className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-3">
        {PLAN_KEYS.map((p) => (
          <PriceCard key={p.name} {...p} cycle={cycle} />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">{t("pricing.payments")}</p>
    </>
  );
}

function PriceCard({
  name, monthly, fkeys, highlight, cycle,
}: { name: string; monthly: number; fkeys: string[]; highlight?: boolean; cycle: "annual" | "monthly" }) {
  const { t } = useI18n();
  const annualMonthlyEquivalent = Math.round(monthly * 0.7);
  const annualTotal = annualMonthlyEquivalent * 12;
  const showAnnual = cycle === "annual";
  const display = showAnnual ? annualMonthlyEquivalent : monthly;
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-7 backdrop-blur ${
        highlight ? "border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow" : "border-border/60 bg-card/60"
      }`}
    >
      {highlight && <BorderBeam size={220} duration={9} />}
      {highlight && (
        <div className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
          {t("pricing.recommended")}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-muted-foreground">R$</span>
        <span className="font-display text-5xl font-bold">{display}</span>
        <span className="text-sm text-muted-foreground">{t("pricing.permonth")}</span>
      </div>
      {showAnnual ? (
        <div className="mt-2 space-y-1 text-xs">
          <div className="text-muted-foreground">
            <span className="line-through">R$ {monthly}/mês</span> · R$ {annualTotal.toLocaleString("pt-BR")} no PIX/ano
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 font-medium text-success">
            {t("pricing.economy", { value: ((monthly - annualMonthlyEquivalent) * 12).toLocaleString("pt-BR") })}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">{t("pricing.recurring")}</div>
      )}
      <ul className="mt-6 space-y-2.5 text-sm">
        {fkeys.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t(k)}
          </li>
        ))}
      </ul>
      <Button
        asChild
        className={`mt-7 w-full ${highlight ? "bg-gradient-to-br from-primary to-primary-glow shadow-glow" : ""}`}
        variant={highlight ? "default" : "outline"}
      >
        <a href={`/auth?next=${encodeURIComponent(`/app/billing?cycle=${cycle}`)}`}>
          {showAnnual ? t("pricing.cta_annual") : t("pricing.cta_monthly")}
        </a>
      </Button>
    </div>
  );
}
