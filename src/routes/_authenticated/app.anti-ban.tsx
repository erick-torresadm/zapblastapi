import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, AlertTriangle, Check, X, Flame, MessageSquare,
  Clock, Phone, Link as LinkIcon, Inbox, RefreshCw, Server,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/anti-ban")({
  component: AntiBan,
});

function AntiBan() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-8 shadow-glow">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-glow">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Guia Anti-ban</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Por que a Evolution API banna menos, o que realmente derruba número, e o checklist que você precisa seguir antes de cada disparo.
            </p>
          </div>
        </div>
      </div>

      {/* Comparativo */}
      <Card className="border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-display text-xl">whatsapp-web.js vs Evolution API</CardTitle>
          <p className="text-sm text-muted-foreground">Por que a escolha da biblioteca importa — e onde ela não importa.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">whatsapp-web.js</h3>
              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Risco alto</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">pedroslopez · Puppeteer + Chromium</p>
            <ul className="mt-4 space-y-2 text-sm">
              <BadItem text="Fingerprint de Chromium detectável (navigator.webdriver)" />
              <BadItem text="Presença / digitação simuladas via DOM — gera padrão" />
              <BadItem text="~300MB RAM por instância, limita escala" />
              <BadItem text="Quebra com updates do WhatsApp Web" />
              <BadItem text="Reconexões reabrem navegador (suspeito)" />
            </ul>
          </div>

          <div className="rounded-xl border border-success/30 bg-success/5 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Evolution API</h3>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Risco baixo*</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Baileys · WebSocket multi-device</p>
            <ul className="mt-4 space-y-2 text-sm">
              <GoodItem text="Protocolo nativo — tráfego idêntico ao app oficial" />
              <GoodItem text="Presence/typing/read receipts nativos do protocolo" />
              <GoodItem text="~30MB RAM, escala para dezenas de chips" />
              <GoodItem text="Reconexão silenciosa via WebSocket" />
              <GoodItem text="Sem fingerprint de browser detectável" />
            </ul>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
            <div className="flex gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
              <div>
                <strong className="text-foreground">A lib reduz o risco, mas não elimina.</strong>{" "}
                <span className="text-muted-foreground">O que mais derruba número é <em>comportamento</em>, não a biblioteca. Veja abaixo.</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* O que derruba */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">O que realmente derruba número</h2>
        <p className="text-sm text-muted-foreground">Independente da biblioteca. Cuide disso primeiro.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <RiskCard icon={Phone} title="Volume sem warmup" desc="Chip novo disparando 200+ msgs/dia = ban em horas. Use o módulo de aquecimento." />
          <RiskCard icon={MessageSquare} title="Conteúdo idêntico" desc="Mesma mensagem byte-a-byte pra N contatos. Use spintax sempre." />
          <RiskCard icon={Clock} title="Timing fixo" desc="Intervalos exatos (5s, 10s) gritam 'bot'. Randomize 8-45s." />
          <RiskCard icon={LinkIcon} title="Link na primeira msg" desc="Gatilho clássico de denúncia. Mande texto primeiro, link na 2ª/3ª." />
          <RiskCard icon={Inbox} title="Zero inbound" desc="Número que só fala e nunca responde é flagado. Use o Inbox." />
          <RiskCard icon={RefreshCw} title="Reconexões frequentes" desc="Servidor instável dispara reconexões = WhatsApp desconfia." />
          <RiskCard icon={Server} title="Múltiplos IPs" desc="Mesma sessão pulando de IP parece sessão roubada. Use IP fixo." />
          <RiskCard icon={AlertTriangle} title="Denúncias" desc="3-5 pessoas clicando 'Bloquear e Denunciar' = ban. Mande pra quem espera." />
        </div>
      </div>

      {/* Checklist */}
      <Card className="border-success/30 bg-gradient-to-br from-success/5 to-card backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-success" />
            <CardTitle className="font-display text-xl">Checklist antes de cada campanha</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2.5 md:grid-cols-2">
            <ChkItem text="Chips com 7+ dias de aquecimento" />
            <ChkItem text="Spintax aplicado (pelo menos 3 variações por bloco)" />
            <ChkItem text="Delay randômico 8-45s configurado" />
            <ChkItem text="Limite diário por chip (máx 300 msgs/dia)" />
            <ChkItem text="Janela de horário comercial (9h-20h)" />
            <ChkItem text="Sem links na primeira mensagem" />
            <ChkItem text="Lista validada — só números BR existentes" />
            <ChkItem text="Pool com 3+ chips para rotação" />
          </ul>
        </CardContent>
      </Card>

      {/* Warmup table */}
      <Card className="border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-display text-xl">Curva de aquecimento recomendada</CardTitle>
          <p className="text-sm text-muted-foreground">Aumente o volume gradualmente. Não pule etapas.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Fase</th>
                  <th className="px-4 py-3 text-left">Dias</th>
                  <th className="px-4 py-3 text-left">Msgs/dia</th>
                  <th className="px-4 py-3 text-left">Comportamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <Row phase="🥚 Recém-nascido" days="1-3" msgs="20" desc="Só warmup interno + conversas reais" />
                <Row phase="🐣 Aquecimento" days="4-7" msgs="50" desc="Adicionar 1-2 campanhas pequenas a contatos quentes" />
                <Row phase="🐥 Crescimento" days="8-14" msgs="150" desc="Campanhas médias, monitorar respostas" />
                <Row phase="🐔 Maduro" days="15+" msgs="300+" desc="Operação plena com rotação e circuit breaker" />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BadItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {text}
    </li>
  );
}
function GoodItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {text}
    </li>
  );
}
function ChkItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
      <Check className="h-4 w-4 shrink-0 text-success" /> {text}
    </li>
  );
}
function RiskCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur transition-all hover:border-destructive/40">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-display font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
function Row({ phase, days, msgs, desc }: { phase: string; days: string; msgs: string; desc: string }) {
  return (
    <tr className="bg-card/40">
      <td className="px-4 py-3 font-medium">{phase}</td>
      <td className="px-4 py-3 text-muted-foreground">{days}</td>
      <td className="px-4 py-3 font-mono font-semibold text-primary">{msgs}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{desc}</td>
    </tr>
  );
}
