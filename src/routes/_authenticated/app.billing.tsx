import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, X, Crown, Sparkles, Building2, CreditCard, QrCode, AlertTriangle, Clock } from "lucide-react";
import { getBillingStateFn } from "@/lib/billing.functions";
import { CardCheckoutDialog } from "@/components/billing/CardCheckoutDialog";
import { PixAnnualDialog } from "@/components/billing/PixAnnualDialog";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/billing")({ component: BillingPage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function brlNoDecimals(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }

const planIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  starter: Sparkles, pro: Crown, scale: Building2, enterprise: Building2,
};

type Cycle = "monthly" | "annual";

function BillingPage() {
  const fn = useServerFn(getBillingStateFn);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => fn() });
  const initialCycle: Cycle = (() => {
    if (typeof window === "undefined") return "annual";
    const c = new URLSearchParams(window.location.search).get("cycle");
    return c === "monthly" ? "monthly" : "annual";
  })();
  const [cycle, setCycle] = useState<Cycle>(initialCycle);

  const [cardPlan, setCardPlan] = useState<{ id: string; name: string; price: number } | null>(null);
  const [pixPlan, setPixPlan] = useState<{ id: string; name: string; annual: number } | null>(null);
  const sub = data?.subscription;
  const isActive = sub?.status === "active" || sub?.status === "trialing";
  const limits = usePlanLimits();

  const pct = (used: number, max: number) => (max === -1 ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100)));
  const lim = limits.data?.limits;
  const use = limits.data?.usage;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Planos & Assinatura</h1>
        <p className="text-muted-foreground">Escolha o plano ideal pra escalar seus disparos.</p>
      </div>

      {/* Banner: trial acabando ou expirado */}
      {limits.isTrialing && limits.trialDaysLeft !== null && limits.trialDaysLeft <= 3 && limits.trialDaysLeft > 0 && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="flex items-center gap-3 py-4">
            <Clock className="h-5 w-5 text-warning flex-shrink-0" />
            <div className="flex-1 text-sm">
              <strong>Seu teste grátis acaba em {limits.trialDaysLeft} {limits.trialDaysLeft === 1 ? "dia" : "dias"}.</strong>
              {" "}Assine pra não perder seus chips e campanhas.
            </div>
          </CardContent>
        </Card>
      )}
      {limits.isPastDue && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div className="flex-1 text-sm">
              <strong>Teste grátis expirado.</strong> Disparos e novos chips estão bloqueados. Seus dados e CRM continuam acessíveis — assine pra reativar.
            </div>
          </CardContent>
        </Card>
      )}

      {sub && (
        <Card className={cn(isActive && "border-primary/60 bg-primary/5")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Crown className="h-5 w-5 text-primary" />
              Seu plano: {sub.subscription_plans?.name ?? "Sem plano"}
              <Badge variant={isActive ? "default" : "destructive"}>
                {limits.isPastDue ? "Expirado" : sub.status === "active" ? "Ativo" : sub.status === "trialing" ? `Teste grátis — ${limits.trialDaysLeft ?? "?"} dias restantes` : sub.status}
              </Badge>
              {sub.payment_method && (
                <Badge variant="outline" className="capitalize">
                  {sub.payment_method === "card" ? "Cartão" : sub.payment_method.toUpperCase()}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {sub.current_period_end && `Renova em ${new Date(sub.current_period_end).toLocaleDateString("pt-BR")}`}
            </CardDescription>
          </CardHeader>
          {lim && use && (
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chips conectados</span>
                  <span className="font-medium">{use.chips} / {limits.fmtLimit(lim.max_chips)}</span>
                </div>
                <Progress value={pct(use.chips, lim.max_chips)} className="h-2" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Campanhas ativas</span>
                  <span className="font-medium">{use.active_campaigns} / {limits.fmtLimit(lim.max_active_campaigns)}</span>
                </div>
                <Progress value={pct(use.active_campaigns, lim.max_active_campaigns)} className="h-2" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mensagens hoje</span>
                  <span className="font-medium">{use.messages_today.toLocaleString("pt-BR")} / {limits.fmtLimit(lim.max_messages_per_day)}</span>
                </div>
                <Progress value={pct(use.messages_today, lim.max_messages_per_day)} className="h-2" />
              </div>
            </CardContent>
          )}
        </Card>
      )}




      {/* Toggle Mensal / Anual */}
      <div className="flex justify-center">
        <div role="tablist" aria-label="Ciclo de cobrança" className="inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1">
          <button
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-colors",
              cycle === "monthly" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mensal
          </button>
          <button
            role="tab"
            aria-selected={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2",
              cycle === "annual" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Anual
            <Badge variant="default" className="bg-success text-success-foreground hover:bg-success">−30%</Badge>
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">PIX</Badge>
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(data?.plans ?? []).map((p) => {
          const Icon = planIcons[p.slug] ?? Sparkles;
          const isCurrent = sub?.plan_id === p.id;
          const annualTotal = (p as { price_annual_cents?: number | null }).price_annual_cents ?? Math.round(p.price_cents * 12 * 0.7);
          const monthlyEquivalent = Math.round(annualTotal / 12);
          const yearlySavings = (p.price_cents * 12) - annualTotal;
          const showAnnual = cycle === "annual";
          const displayPriceCents = showAnnual ? monthlyEquivalent : p.price_cents;

          return (
            <Card key={p.id} className={cn("relative flex flex-col", p.featured && "border-primary shadow-lg", isCurrent && "ring-2 ring-primary border-primary")}>
              {isCurrent && <Badge className="absolute -top-2 left-4 bg-success text-success-foreground">✓ Seu plano</Badge>}
              {p.featured && !isCurrent && <Badge className="absolute -top-2 right-4">Mais popular</Badge>}
              <CardHeader>
                <Icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle>{p.name}</CardTitle>

                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold">{brl(displayPriceCents)}</div>
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </div>
                  {showAnnual ? (
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">
                        <span className="line-through">{brl(p.price_cents)}/mês</span>
                        {" · "}cobrado {brlNoDecimals(annualTotal)}/ano no PIX
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                          Economize {brlNoDecimals(yearlySavings)}/ano
                        </Badge>
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                          PIX preferencial
                        </Badge>
                      </div>
                      {p.featured && (
                        <div className="text-xs font-medium text-primary">🎁 Ganhe ~3,6 meses grátis</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      ou <button onClick={() => setCycle("annual")} className="text-primary font-medium underline-offset-2 hover:underline">economize 30% no anual via PIX ↑</button>
                    </div>
                  )}
                </div>

                <CardDescription className="pt-2">{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm flex-1">
                <Feat ok>Até <strong>{p.max_chips}</strong> chip{p.max_chips > 1 ? "s" : ""} simultâneo{p.max_chips > 1 ? "s" : ""}</Feat>
                <Feat ok><strong>{p.max_messages_per_day.toLocaleString("pt-BR")}</strong> mensagens/dia</Feat>
                <Feat ok={(p.max_active_campaigns ?? 1) !== 0}>
                  {(p.max_active_campaigns ?? 1) === -1 ? "Campanhas ilimitadas" : `${p.max_active_campaigns} campanha${p.max_active_campaigns > 1 ? "s" : ""} simultânea${p.max_active_campaigns > 1 ? "s" : ""}`}
                </Feat>
                <Feat ok={(p.max_contacts_per_list ?? 0) !== 0}>
                  {(p.max_contacts_per_list ?? 0) === -1 ? "Contatos ilimitados/lista" : `${(p.max_contacts_per_list ?? 0).toLocaleString("pt-BR")} contatos/lista`}
                </Feat>
                <Feat ok={(p.max_crm_agents ?? 1) !== 0}>
                  {(p.max_crm_agents ?? 1) === -1 ? "CRM com agentes ilimitados" : `CRM com ${p.max_crm_agents} agente${p.max_crm_agents > 1 ? "s" : ""}`}
                </Feat>
                <Feat ok={(p.warmup_tier ?? "off") !== "off"}>
                  {p.warmup_tier === "advanced" ? "Aquecimento avançado com IA" : p.warmup_tier === "basic" ? "Aquecimento básico" : "Aquecimento desligado"}
                </Feat>
                <Feat ok>Marketplace de chips</Feat>
                {showAnnual && (
                  <Feat ok><strong>Pagamento único no ano</strong></Feat>
                )}
              </CardContent>

              <CardFooter className="flex-col gap-2">
                {showAnnual ? (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : p.featured ? "default" : "outline"}
                    disabled={isCurrent}
                    onClick={() => setPixPlan({ id: p.id, name: p.name, annual: annualTotal })}
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    {isCurrent ? "Plano atual" : "Assinar anual via PIX"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : p.featured ? "default" : "outline"}
                    disabled={isCurrent}
                    onClick={() => setCardPlan({ id: p.id, name: p.name, price: p.price_cents })}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {isCurrent ? "Plano atual" : "Assinar no cartão"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">PIX</Badge>
            <Badge variant="outline">Cartão de crédito</Badge>
            <span>· em breve via Efí Bank</span>
          </div>
          <div>
            💚 <strong>PIX no anual</strong> tem o melhor preço — pagamento à vista com 30% de desconto.
            Cartão será aceito em mensal e anual (parcelado). Por enquanto, todos os usuários têm acesso liberado pra testar.
          </div>
        </CardContent>
      </Card>

      {cardPlan && (
        <CardCheckoutDialog
          open={!!cardPlan}
          onOpenChange={(o) => !o && setCardPlan(null)}
          planId={cardPlan.id}
          planName={cardPlan.name}
          priceCents={cardPlan.price}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["billing"] })}
        />
      )}

      {pixPlan && (
        <PixAnnualDialog
          open={!!pixPlan}
          onOpenChange={(o) => !o && setPixPlan(null)}
          planId={pixPlan.id}
          planName={pixPlan.name}
          annualCents={pixPlan.annual}
        />
      )}
    </div>
  );
}
