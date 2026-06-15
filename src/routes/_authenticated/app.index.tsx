import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, Send, MessageCircle, TrendingUp, ShieldCheck, ArrowRight,
  Flame, Wallet, Activity, AlertTriangle, Sparkles,
} from "lucide-react";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BorderBeam } from "@/components/magicui/border-beam";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [instances, campaigns, sentToday, replies, wallet] = await Promise.all([
        supabase.from("whatsapp_instances").select("id,status,phone_number", { count: "exact" }),
        supabase.from("campaigns").select("id,name,status,created_at").in("status", ["running", "scheduled"]).order("created_at", { ascending: false }).limit(5),
        supabase.from("campaign_messages").select("id", { count: "exact", head: true }).gte("sent_at", today.toISOString()).in("status", ["sent", "delivered", "read", "replied"]),
        supabase.from("incoming_messages").select("id", { count: "exact", head: true }).gte("received_at", today.toISOString()),
        supabase.from("wallets").select("balance_cents").maybeSingle(),
      ]);
      const all = instances.data ?? [];
      const connected = all.filter((i) => i.status === "connected").length;
      return {
        connected,
        totalInstances: instances.count ?? 0,
        activeCampaigns: campaigns.data ?? [],
        activeCampaignsCount: (campaigns.data ?? []).length,
        sentToday: sentToday.count ?? 0,
        repliesToday: replies.count ?? 0,
        balance: (wallet.data?.balance_cents ?? 0) / 100,
      };
    },
  });

  const stats = [
    { label: "Chips conectados", value: data?.connected ?? 0, suffix: ` / ${data?.totalInstances ?? 0}`, icon: Smartphone, color: "text-success", bg: "bg-success/10" },
    { label: "Mensagens hoje", value: data?.sentToday ?? 0, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Respostas hoje", value: data?.repliesToday ?? 0, icon: MessageCircle, color: "text-chart-2", bg: "bg-chart-2/10" },
    { label: "Saldo carteira", value: data?.balance ?? 0, prefix: "R$ ", decimals: 2, icon: Wallet, color: "text-warning", bg: "bg-warning/10" },
  ];

  const healthScore = data ? Math.min(100, Math.round(((data.connected) / Math.max(1, data.totalInstances)) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">Sua operação em tempo real</p>
        </div>
        <Button asChild className="bg-gradient-to-br from-primary to-primary-glow shadow-glow">
          <Link to="/app/campaigns/new"><Send className="mr-2 h-4 w-4" /> Nova campanha</Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all hover:border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold tracking-tight">
                <NumberTicker value={s.value} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals ?? 0} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bento grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Health */}
        <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/60 backdrop-blur lg:col-span-2">
          <BorderBeam size={220} duration={11} />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display text-lg">Anti-ban Health Score</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Saúde geral da sua operação anti-ban</p>
              </div>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                <Activity className="mr-1 h-3 w-3" /> Operacional
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-6xl font-bold text-aurora">{healthScore}</span>
              <span className="text-2xl text-muted-foreground">/100</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow shadow-[0_0_12px_var(--color-primary)] transition-all duration-700"
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <div className="mt-6 grid gap-2 text-sm">
              <CheckItem ok={data ? data.connected > 0 : false} label="Chips conectados e respondendo" />
              <CheckItem ok={data ? data.connected >= 3 : false} label="Pool com 3+ chips para rotação" />
              <CheckItem ok={data ? data.repliesToday > 0 : false} label="Tráfego bidirecional (recebendo respostas)" />
            </div>
            <Button asChild variant="outline" size="sm" className="mt-5 border-primary/30 hover:bg-primary/10">
              <Link to="/app/anti-ban">Guia anti-ban completo <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* Quick start / Warmup */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-warning" />
              <CardTitle className="font-display text-lg">Aquecimento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Mantenha seus chips aquecidos com conversas automáticas entre números conectados.
            </p>
            <Button asChild size="sm" variant="outline" className="w-full border-warning/40 hover:bg-warning/10">
              <Link to="/app/warmup"><Flame className="mr-2 h-3.5 w-3.5" /> Configurar warmup</Link>
            </Button>
            <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
              💡 Chips novos precisam de <strong className="text-foreground">7-14 dias</strong> de aquecimento antes de campanhas grandes.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active campaigns + Tips */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/60 backdrop-blur lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">Campanhas ativas</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/campaigns">Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!data?.activeCampaigns?.length ? (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                <Send className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma campanha rodando</p>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/app/campaigns/new">Criar primeira campanha</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {data.activeCampaigns.map((c: any) => (
                  <Link
                    key={c.id}
                    to="/app/campaigns/$id"
                    params={{ id: c.id }}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                    <Badge variant="outline" className={c.status === "running" ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"}>
                      {c.status === "running" ? "Rodando" : "Agendada"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="font-display text-lg">Dicas pra hoje</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tip icon={ShieldCheck} text="Sempre use spintax — mensagens idênticas = ban garantido." />
            <Tip icon={AlertTriangle} text="Não envie links na primeira mensagem para contatos novos." />
            <Tip icon={Flame} text="Aqueça chips novos antes de incluí-los em campanhas grandes." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full ${ok ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"}`}>
        {ok ? "✓" : "—"}
      </div>
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function Tip({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
