import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Building2, CreditCard } from "lucide-react";
import { getBillingStateFn } from "@/lib/billing.functions";
import { CardCheckoutDialog } from "@/components/billing/CardCheckoutDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/billing")({ component: BillingPage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function brlNoDecimals(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }

const planIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  starter: Sparkles, pro: Crown, enterprise: Building2,
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
  const sub = data?.subscription;
  const isActive = sub?.status === "active" || sub?.status === "trialing";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Planos & Assinatura</h1>
        <p className="text-muted-foreground">Escolha o plano ideal pra escalar seus disparos.</p>
      </div>

      {sub && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Assinatura atual <Badge variant={isActive ? "default" : "destructive"}>{sub.status}</Badge></CardTitle>
            <CardDescription>
              {sub.subscription_plans?.name ?? "Sem plano"}
              {sub.current_period_end && ` · renova em ${new Date(sub.current_period_end).toLocaleDateString("pt-BR")}`}
            </CardDescription>
          </CardHeader>
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
            <Card key={p.id} className={cn("relative flex flex-col", p.featured && "border-primary shadow-lg")}>
              {p.featured && <Badge className="absolute -top-2 right-4">Mais popular</Badge>}
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
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Até {p.max_chips} chips simultâneos</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {p.max_messages_per_day.toLocaleString("pt-BR")} mensagens/dia</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Aquecimento automático</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Marketplace de chips</div>
                {showAnnual && (
                  <div className="flex items-center gap-2 font-medium"><Check className="h-4 w-4 text-success" /> Pagamento único no ano</div>
                )}
              </CardContent>
              <CardFooter className="flex-col gap-2">
                {showAnnual ? (
                  <Button className="w-full" variant={isCurrent ? "outline" : p.featured ? "default" : "outline"} disabled>
                    {isCurrent ? "Plano atual" : "Assinar anual via PIX (em breve)"}
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
    </div>
  );
}
