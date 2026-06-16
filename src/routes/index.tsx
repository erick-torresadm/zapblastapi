import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Perseidas — Disparos, Chatbot e CRM no WhatsApp sem ban" },
      { name: "description", content: "Plataforma all-in-one: disparos em massa anti-ban, fluxos automáticos com palavra-chave, CRM com múltiplos atendentes e aquecimento de chips. Tudo num só painel." },
      { property: "og:title", content: "Perseidas — Disparos, Chatbot e CRM no WhatsApp sem ban" },
      { property: "og:description", content: "Disparo + fluxos por palavra-chave + CRM multi-atendente + anti-ban. Tudo num só painel." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER — floating pill */}
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-border/60 bg-background/70 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
          <div className="pl-2">
            <Logo to="/" size="sm" />
          </div>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#anti-ban" className="transition-colors hover:text-foreground">Anti-ban</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Planos</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="sm" className="rounded-full bg-gradient-to-br from-primary to-primary-glow shadow-glow">
              <Link to="/auth">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>
      {/* spacer for floating header */}
      <div aria-hidden className="h-20" />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <GridPattern />
        <Meteors number={25} />
        <div className="container relative mx-auto px-4 pb-24 pt-20 text-center md:pt-32">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Powered by Evolution API · Anti-ban Engine v2
          </div>
          <h1 className="mx-auto max-w-4xl font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            Dispare no WhatsApp <br />
            <span className="text-aurora">sem queimar seus chips</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            A única plataforma com <strong className="text-foreground">aquecimento automático bidirecional</strong>,
            rotação inteligente, marketplace de chips BR e engine anti-ban de última geração.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-to-br from-primary to-primary-glow shadow-glow">
              <Link to="/auth">
                Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border/60 bg-card/40 backdrop-blur">
              <a href="#anti-ban">Como evitamos bans</a>
            </Button>
          </div>

          {/* metrics */}
          <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/40 md:grid-cols-4">
            {[
              { v: 99.4, suf: "%", l: "Uptime entrega" },
              { v: 12, suf: "M+", l: "Msgs enviadas" },
              { v: 87, suf: "%", l: "Menos bans" },
              { v: 4200, suf: "+", l: "Chips ativos" },
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
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">Recursos</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
            Tudo que disparo sério precisa.
          </h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl gap-4 md:grid-cols-3">
          {/* Big card — anti-ban */}
          <div className="relative col-span-1 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-7 backdrop-blur md:col-span-2 md:row-span-2">
            <BorderBeam size={250} duration={10} />
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h3 className="mt-4 font-display text-2xl font-semibold">Anti-ban Engine</h3>
            <p className="mt-2 text-muted-foreground">
              Delays randômicos, spintax obrigatório, presença/digitação simulada, circuit breaker e limite diário por chip — tudo automático.
            </p>
            <ul className="mt-6 grid gap-2 text-sm">
              {[
                "Detecta padrões suspeitos antes do WhatsApp",
                "Health score por chip em tempo real",
                "Pausa automática se taxa de erro >5%",
                "Warmup escalonado de 20 → 300+ msgs/dia",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {x}
                </li>
              ))}
            </ul>
          </div>

          <FeatureCard icon={Flame} title="Aquecimento bidirecional" desc="Seus chips conversam entre si automaticamente, simulando uso humano antes do disparo." />
          <FeatureCard icon={ShoppingCart} title="Marketplace de chips BR" desc="Compre chips virtuais brasileiros direto no painel, com saldo pré-pago." />
          <FeatureCard icon={Shuffle} title="Rotação inteligente" desc="Round-robin entre dezenas de chips com balanceamento por health score." />
          <FeatureCard icon={MessageSquare} title="Spintax + variáveis" desc="{Oi|Olá|E aí} {{nome}} — cada envio é único, ninguém repete mensagem." />
          <FeatureCard icon={Clock} title="Agendamento" desc="Janela de horário comercial, fuso configurável, retomada automática." />
          <FeatureCard icon={BarChart3} title="Relatórios em tempo real" desc="Entregues, lidas, respondidas — por chip, por campanha, por contato." />
        </div>
      </section>

      {/* ANTI-BAN STRIP */}
      <section id="anti-ban" className="border-y border-border/60 bg-card/30 py-24">
        <div className="container mx-auto grid gap-12 px-4 md:grid-cols-2 md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Por que menos bans?</div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight">
              Evolution API ≠ <span className="text-muted-foreground/60 line-through">whatsapp-web.js</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Bibliotecas baseadas em Puppeteer (pedroslopez) automatizam o navegador — o WhatsApp identifica isso na hora.
              A Evolution conversa direto no protocolo multi-device, igual o app oficial. Resultado: tráfego indistinguível de um celular real.
            </p>
            <Button asChild variant="outline" className="mt-6 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">
              <Link to="/auth">Ler análise completa <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid gap-3">
            <CompareRow label="Fingerprint de browser" a="❌ Detectável" b="✅ Protocolo nativo" />
            <CompareRow label="Presence / typing" a="❌ Simulado via DOM" b="✅ Nativo" />
            <CompareRow label="Reconexão" a="❌ Reload visível" b="✅ Silenciosa" />
            <CompareRow label="RAM por instância" a="~300 MB" b="~30 MB" />
            <CompareRow label="Risco de ban" a="🔴 Alto" b="🟢 Baixo*" />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">Planos</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">Escolha sua escala.</h2>
          <p className="mt-3 text-muted-foreground">Sem fidelidade. Cancele quando quiser.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          <PriceCard name="Starter" price="97" features={["5 chips inclusos", "10k msgs/mês", "Anti-ban basic", "Suporte por email"]} />
          <PriceCard name="Pro" price="297" highlight features={["20 chips inclusos", "50k msgs/mês", "Anti-ban full + Warmup", "Marketplace + saldo R$50 grátis", "Suporte prioritário"]} />
          <PriceCard name="Scale" price="697" features={["50 chips inclusos", "Msgs ilimitadas", "Multi-server", "API white-label", "Suporte 24/7"]} />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-card/30 py-24">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">FAQ</div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight">Perguntas frequentes</h2>
          </div>
          <div className="mt-10 space-y-3">
            {[
              { q: "Meu chip vai ser banido?", a: "Nenhuma plataforma garante 100% — quem garante mente. O que fazemos: reduzir drasticamente o risco com aquecimento, spintax, delays humanos e circuit breaker. Histórico de chips bem aquecidos = >90% de sobrevida em 30 dias." },
              { q: "Preciso da Evolution API?", a: "Sim — você pode usar a sua ou contratar uma da nossa lista de provedores recomendados." },
              { q: "Posso comprar chips dentro da plataforma?", a: "Sim, no Marketplace. Chips virtuais BR a partir de R$ 7,90, pagamento via saldo pré-pago." },
              { q: "Aceita Pix?", a: "Sim. Pix, cartão e boleto via Stripe." },
            ].map((f) => (
              <details key={f.q} className="group rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur">
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
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-card p-12 text-center shadow-glow">
          <BorderBeam size={400} duration={12} />
          <Meteors number={15} />
          <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Pronto pra disparar de verdade?</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Crie sua conta, conecte a Evolution e mande a primeira campanha em 5 minutos.
          </p>
          <Button asChild size="lg" className="mt-8 bg-gradient-to-br from-primary to-primary-glow shadow-glow">
            <Link to="/auth">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> © 2026 Perseidas · Anti-ban Suite
          </div>
          <div className="text-xs">*Resultados variam conforme uso. Anti-ban reduz risco, não elimina.</div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all hover:border-primary/40 hover:shadow-glow">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm text-muted-foreground/80">{a}</div>
      <div className="text-sm font-medium text-foreground">{b}</div>
    </div>
  );
}

function PriceCard({ name, price, features, highlight }: { name: string; price: string; features: string[]; highlight?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-7 backdrop-blur ${
        highlight ? "border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow" : "border-border/60 bg-card/60"
      }`}
    >
      {highlight && <BorderBeam size={220} duration={9} />}
      {highlight && (
        <div className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
          Recomendado
        </div>
      )}
      <h3 className="font-display text-xl font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-muted-foreground">R$</span>
        <span className="font-display text-5xl font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">/mês</span>
      </div>
      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {f}
          </li>
        ))}
      </ul>
      <Button
        asChild
        className={`mt-7 w-full ${highlight ? "bg-gradient-to-br from-primary to-primary-glow shadow-glow" : ""}`}
        variant={highlight ? "default" : "outline"}
      >
        <Link to="/auth">Assinar {name}</Link>
      </Button>
    </div>
  );
}
