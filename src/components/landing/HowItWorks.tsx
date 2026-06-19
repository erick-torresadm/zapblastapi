import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";
import {
  Smartphone, Workflow, MessageSquare, BarChart3, Check,
  Send, Bot, User, Flame, Sparkles, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Conecte seu chip",
    desc: "Escaneie o QR Code ou compre um chip BR no marketplace. Aquecimento automático começa em segundos.",
    icon: Smartphone,
    accent: "from-blue-500/20 to-cyan-500/10",
  },
  {
    n: "02",
    title: "Monte seu fluxo",
    desc: "Arraste blocos: cliente digita 'preço' → bot manda áudio + imagem + texto com 'digitando…' simulado.",
    icon: Workflow,
    accent: "from-purple-500/20 to-pink-500/10",
  },
  {
    n: "03",
    title: "Dispare ou atenda",
    desc: "Campanha em massa anti-ban OU inbox CRM multi-atendente. Você escolhe — ou faz os dois.",
    icon: MessageSquare,
    accent: "from-orange-500/20 to-red-500/10",
  },
  {
    n: "04",
    title: "Monitore tudo",
    desc: "Entregas, leituras, respostas, health score por chip. Pausa automática se algo cheira a ban.",
    icon: BarChart3,
    accent: "from-emerald-500/20 to-teal-500/10",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setActive((a) => (a + 1) % 4), 4500);
    return () => clearInterval(t);
  }, [inView]);

  return (
    <section id="how" ref={ref} className="relative overflow-hidden border-y border-border/60 bg-card/20 py-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">Como funciona</div>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
            Do <span className="text-aurora">QR Code</span> ao primeiro venda
          </h2>
          <p className="mt-4 text-muted-foreground">
            4 passos. 5 minutos. Sem código, sem servidor, sem dor de cabeça.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          {/* STEPS LIST */}
          <div className="space-y-3">
            {STEPS.map((s, i) => {
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
                    "group relative flex w-full gap-4 rounded-2xl border p-5 text-left transition-all",
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
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 transition-all",
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
                        {s.title}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
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
  const nodes = [
    { x: "10%", y: "20%", label: "Mensagem recebida", icon: MessageSquare, color: "primary" },
    { x: "50%", y: "20%", label: "Contém 'preço'?", icon: Sparkles, color: "amber" },
    { x: "75%", y: "55%", label: "Enviar áudio", icon: Bot, color: "purple" },
    { x: "25%", y: "70%", label: "Aguardar 30s", icon: Workflow, color: "blue" },
    { x: "55%", y: "80%", label: "Notificar atendente", icon: User, color: "emerald" },
  ];
  return (
    <motion.div
      key="flow"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative h-full p-4"
    >
      {/* grid bg */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.2)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.2)_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* connection lines */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <motion.line
          x1="20%" y1="28%" x2="48%" y2="28%"
          stroke="hsl(var(--primary))" strokeWidth="1.5" strokeDasharray="3 3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.6 }}
        />
        <motion.line
          x1="58%" y1="32%" x2="78%" y2="55%"
          stroke="hsl(var(--primary))" strokeWidth="1.5" strokeDasharray="3 3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.6 }}
        />
        <motion.line
          x1="50%" y1="32%" x2="30%" y2="70%"
          stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.6 }}
        />
        <motion.line
          x1="35%" y1="78%" x2="55%" y2="82%"
          stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 0.6 }}
        />
      </svg>

      {nodes.map((n, i) => {
        const Icon = n.icon;
        return (
          <motion.div
            key={n.label}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }}
            className="absolute flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 shadow-md"
            style={{ left: n.x, top: n.y, transform: "translate(-50%, -50%)" }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/15 text-primary">
              <Icon className="h-3 w-3" />
            </div>
            <span className="text-[10px] font-medium text-foreground">{n.label}</span>
          </motion.div>
        );
      })}

      {/* moving pulse */}
      <motion.div
        className="absolute h-2 w-2 rounded-full bg-primary shadow-glow"
        initial={{ left: "10%", top: "20%", opacity: 0 }}
        animate={{
          left: ["10%", "50%", "75%"],
          top: ["20%", "20%", "55%"],
          opacity: [0, 1, 1, 0],
        }}
        transition={{ delay: 1.2, duration: 2, repeat: Infinity, repeatDelay: 1 }}
      />
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
