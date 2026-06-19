import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";
import {
  Smartphone, Workflow, MessageSquare, BarChart3, Check,
  Send, Bot, User, Flame, Sparkles, ArrowRight, Type, Clock, Reply, MousePointer2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const STEP_DEFS = [
  { n: "01", k: "step1", icon: Smartphone, accent: "from-blue-500/20 to-cyan-500/10" },
  { n: "02", k: "step2", icon: Workflow,   accent: "from-purple-500/20 to-pink-500/10" },
  { n: "03", k: "step3", icon: MessageSquare, accent: "from-orange-500/20 to-red-500/10" },
  { n: "04", k: "step4", icon: BarChart3,  accent: "from-emerald-500/20 to-teal-500/10" },
];

export function HowItWorks() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const tm = setInterval(() => setActive((a) => (a + 1) % 4), 4500);
    return () => clearInterval(tm);
  }, [inView]);

  return (
    <section id="how" ref={ref} className="relative overflow-hidden border-y border-border/60 bg-card/20 py-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">{t("how.kicker")}</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
            {t("how.title1")} <span className="text-aurora">{t("how.title2")}</span> {t("how.title3")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("how.subtitle")}</p>
        </div>

        <div className="mx-auto mt-16 grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          {/* STEPS LIST */}
          <div className="space-y-3">
            {STEP_DEFS.map((s, i) => {
              const Icon = s.icon;
              const isActive = active === i;
              return (
                <motion.button
                  key={s.n}
                  initial={{ opacity: 0, x: -20 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  onClick={() => setActive(i)}
                  className={cn(
                    "group relative flex w-full gap-4 rounded-3xl border p-5 text-left transition-all",
                    isActive
                      ? "border-primary/50 bg-card shadow-glow"
                      : "border-border/40 bg-card/30 hover:border-border/70 hover:bg-card/60",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="step-indicator"
                      className="absolute -left-px top-4 h-[calc(100%-2rem)] w-[3px] rounded-full bg-gradient-to-b from-primary to-primary-glow"
                    />
                  )}
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 transition-all",
                      s.accent,
                      isActive ? "ring-primary/40 scale-110" : "ring-border/50",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground/60">{s.n}</span>
                      <h3 className={cn("font-display text-lg font-semibold transition-colors", isActive ? "text-foreground" : "text-foreground/80")}>
                        {t(`how.${s.k}.title`)}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`how.${s.k}.desc`)}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>


          {/* PREVIEW PANEL — animated mockup */}
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card/80 to-card/60 shadow-2xl backdrop-blur">
              {/* window chrome */}
              <div className="flex items-center gap-2 border-b border-border/40 bg-background/40 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="ml-3 flex-1 truncate font-mono text-xs text-muted-foreground">
                  perseidas.app/{["chips", "flows", "campaigns", "analytics"][active]}
                </div>
              </div>

              {/* panel content */}
              <div className="relative h-[calc(100%-2.75rem)] overflow-hidden">
                {active === 0 && <ChipsPanel />}
                {active === 1 && <FlowPanel />}
                {active === 2 && <CRMPanel />}
                {active === 3 && <AnalyticsPanel />}
              </div>
            </div>

            {/* floating accent */}
            <div className="absolute -bottom-8 -right-8 -z-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -left-8 -top-8 -z-10 h-40 w-40 rounded-full bg-primary-glow/20 blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── PANEL MOCKUPS ─────────── */

function ChipsPanel() {
  return (
    <motion.div
      key="chips"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid h-full grid-cols-2 gap-3 p-4"
    >
      {[
        { name: "+55 11 9 8765-4321", status: "Aquecendo", pct: 78, hue: "emerald" },
        { name: "+55 21 9 7654-3210", status: "Ativo", pct: 100, hue: "primary" },
        { name: "+55 31 9 9876-1234", status: "Aquecendo", pct: 42, hue: "amber" },
        { name: "+55 41 9 5432-8765", status: "Ativo", pct: 95, hue: "primary" },
      ].map((c, i) => (
        <motion.div
          key={c.name}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="rounded-xl border border-border/60 bg-card/60 p-3"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[10px] text-foreground">{c.name}</div>
              <div className="text-[9px] text-muted-foreground">{c.status}</div>
            </div>
            <Flame className="h-3 w-3 text-orange-400" />
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${c.pct}%` }}
              transition={{ delay: i * 0.1 + 0.3, duration: 0.8 }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            />
          </div>
          <div className="mt-1 text-right text-[9px] font-mono text-muted-foreground">{c.pct}%</div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function FlowPanel() {
  // Loop the whole "build the flow" sequence
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCycle((c) => c + 1), 6500);
    return () => clearInterval(t);
  }, []);

  // Layout in % so arrows align mathematically
  const blocks = [
    { id: "trigger", x: 18, y: 26, label: "Mensagem recebida", sub: "quando: contém 'preço'", icon: MessageSquare, tone: "primary" as const },
    { id: "text",    x: 75, y: 26, label: "Enviar texto",      sub: "'Oi! 👋 Vou te mandar…'", icon: Type, tone: "purple" as const },
    { id: "wait",    x: 75, y: 70, label: "Aguardar",          sub: "30 segundos",            icon: Clock, tone: "amber" as const },
    { id: "reply",   x: 18, y: 70, label: "Enviar resposta",   sub: "áudio + imagem",         icon: Reply, tone: "emerald" as const },
  ];

  const toneRing: Record<string, string> = {
    primary: "ring-primary/50 bg-primary/15 text-primary",
    purple:  "ring-purple-400/50 bg-purple-400/15 text-purple-300",
    amber:   "ring-amber-400/50 bg-amber-400/15 text-amber-300",
    emerald: "ring-emerald-400/50 bg-emerald-400/15 text-emerald-300",
  };

  // Timing per step (s) — block snap, then arrow draws to next
  const stepDelay = (i: number) => 0.2 + i * 0.9;
  const arrowDelay = (i: number) => stepDelay(i) + 0.45;
  const doneDelay = stepDelay(blocks.length) + 0.1; // after last block

  return (
    <motion.div
      key={`flow-${cycle}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative h-full p-4"
    >
      {/* grid bg */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.18)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.18)_1px,transparent_1px)] bg-[size:22px_22px]" />

      {/* arrows — drawn AFTER each block snaps */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="hsl(var(--primary))" />
          </marker>
        </defs>
        {/* trigger -> text (top horizontal) */}
        <motion.line
          x1="26%" y1="26%" x2="67%" y2="26%"
          stroke="hsl(var(--primary))" strokeWidth="1.8"
          markerEnd="url(#arrowhead)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: arrowDelay(0), duration: 0.4, ease: "easeOut" }}
        />
        {/* text -> wait (right vertical) */}
        <motion.line
          x1="75%" y1="34%" x2="75%" y2="62%"
          stroke="hsl(var(--primary))" strokeWidth="1.8"
          markerEnd="url(#arrowhead)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: arrowDelay(1), duration: 0.4, ease: "easeOut" }}
        />
        {/* wait -> reply (bottom horizontal, right→left) */}
        <motion.line
          x1="67%" y1="70%" x2="26%" y2="70%"
          stroke="hsl(var(--primary))" strokeWidth="1.8"
          markerEnd="url(#arrowhead)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: arrowDelay(2), duration: 0.4, ease: "easeOut" }}
        />
      </svg>

      {/* blocks — snap in one by one */}
      {blocks.map((b, i) => {
        const Icon = b.icon;
        // direction of entrance: drift in from outside the canvas
        const from =
          i === 0 ? { x: -40, y: -20 } :
          i === 1 ? { x: 40, y: -20 } :
          i === 2 ? { x: 40, y: 20 } :
                    { x: -40, y: 20 };
        return (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, scale: 0.4, x: from.x, y: from.y }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            transition={{
              delay: stepDelay(i),
              type: "spring",
              stiffness: 360,
              damping: 18,
              mass: 0.6,
            }}
            className="absolute z-10"
            style={{ left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%, -50%)" }}
          >
            {/* snap pulse ring */}
            <motion.span
              className={cn("pointer-events-none absolute inset-0 rounded-xl ring-2", toneRing[b.tone])}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.7, 0], scale: [1, 1.35, 1.5] }}
              transition={{ delay: stepDelay(i) + 0.05, duration: 0.55 }}
            />
            <div className="relative flex min-w-[130px] items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
              <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1", toneRing[b.tone])}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold leading-tight text-foreground">{b.label}</div>
                <div className="truncate text-[9px] leading-tight text-muted-foreground">{b.sub}</div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* "Pronto" button — appears after flow built, gets clicked */}
      <motion.div
        className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: doneDelay, type: "spring", stiffness: 300, damping: 18 }}
      >
        <motion.button
          type="button"
          className="relative flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary-glow px-4 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow"
          animate={{ scale: [1, 0.92, 1.04, 1] }}
          transition={{ delay: doneDelay + 0.9, duration: 0.5, times: [0, 0.3, 0.65, 1] }}
        >
          <Check className="h-3 w-3" />
          Pronto
          {/* success ring burst */}
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/60"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.8, 0], scale: [1, 1.6, 1.9] }}
            transition={{ delay: doneDelay + 1.0, duration: 0.7 }}
          />
        </motion.button>

        {/* fake cursor flies in and clicks */}
        <motion.div
          className="pointer-events-none absolute -right-6 -bottom-5 text-foreground drop-shadow"
          initial={{ opacity: 0, x: 30, y: 20 }}
          animate={{
            opacity: [0, 1, 1, 1, 0],
            x: [30, 0, 0, 0, -4],
            y: [20, 0, 0, 0, -4],
          }}
          transition={{ delay: doneDelay + 0.3, duration: 1.4, times: [0, 0.4, 0.55, 0.75, 1] }}
        >
          <MousePointer2 className="h-4 w-4 fill-foreground" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function CRMPanel() {
  const msgs = [
    { from: "in", text: "Oi, ainda tem o curso?", t: "14:02" },
    { from: "out", text: "Tem sim! 🚀 Vou te mandar os detalhes", t: "14:02" },
    { from: "out", text: "Hoje 30% off no PIX", t: "14:03" },
    { from: "in", text: "Top! Como pago?", t: "14:05" },
  ];
  return (
    <motion.div
      key="crm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="grid h-full grid-cols-[140px_1fr]"
    >
      {/* sidebar */}
      <div className="border-r border-border/40 bg-background/40 p-2">
        {["Maria S.", "João P.", "Ana L.", "Pedro M."].map((n, i) => (
          <motion.div
            key={n}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={cn(
              "mb-1 rounded-lg p-2 text-[10px]",
              i === 0 ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-card/60",
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary-glow" />
              <div className="flex-1 truncate font-medium text-foreground">{n}</div>
              {i === 0 && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </div>
            <div className="ml-6 truncate text-muted-foreground">Última msg…</div>
          </motion.div>
        ))}
      </div>

      {/* chat */}
      <div className="flex flex-col p-3">
        <div className="flex-1 space-y-1.5 overflow-hidden">
          {msgs.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.25 }}
              className={cn("flex", m.from === "out" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-2.5 py-1.5 text-[10px]",
                  m.from === "out"
                    ? "rounded-br-sm bg-emerald-600/80 text-white"
                    : "rounded-bl-sm bg-card border border-border/60 text-foreground",
                )}
              >
                {m.text}
                <div className="mt-0.5 text-right text-[8px] opacity-60">{m.t}</div>
              </div>
            </motion.div>
          ))}
          {/* typing indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ delay: 1.8, duration: 1.5 }}
            className="flex justify-start"
          >
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border/60 bg-card px-3 py-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-1 w-1 rounded-full bg-muted-foreground"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ delay: i * 0.15, duration: 0.6, repeat: Infinity }}
                />
              ))}
            </div>
          </motion.div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1.5">
          <div className="flex-1 text-[10px] text-muted-foreground/60">Digite uma mensagem…</div>
          <Send className="h-3 w-3 text-primary" />
        </div>
      </div>
    </motion.div>
  );
}

function AnalyticsPanel() {
  const stats = [
    { label: "Enviadas", value: "12.847", trend: "+24%", color: "primary" },
    { label: "Entregues", value: "12.301", trend: "95.7%", color: "emerald" },
    { label: "Lidas", value: "9.412", trend: "76.5%", color: "blue" },
    { label: "Respondidas", value: "2.103", trend: "+18%", color: "amber" },
  ];
  const bars = [40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100];
  return (
    <motion.div
      key="analytics"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="grid h-full grid-rows-[auto_1fr] gap-3 p-4"
    >
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-lg border border-border/60 bg-card/60 p-2"
          >
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-0.5 font-display text-base font-bold text-foreground">{s.value}</div>
            <div className="text-[9px] font-medium text-emerald-500">{s.trend}</div>
          </motion.div>
        ))}
      </div>
      <div className="rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-medium text-foreground">Disparos por hora</div>
          <div className="flex items-center gap-1 text-[9px] text-emerald-500">
            <Check className="h-2.5 w-2.5" /> Saudável
          </div>
        </div>
        <div className="flex h-20 items-end gap-1.5">
          {bars.map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.5 }}
              className="flex-1 rounded-sm bg-gradient-to-t from-primary/60 to-primary-glow"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
