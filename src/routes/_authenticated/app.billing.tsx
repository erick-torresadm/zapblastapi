import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Building2 } from "lucide-react";
import { getBillingStateFn } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/app/billing")({ component: BillingPage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const planIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  starter: Sparkles, pro: Crown, enterprise: Building2,
};

function BillingPage() {
  const fn = useServerFn(getBillingStateFn);
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => fn() });
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

      <div className="grid gap-4 md:grid-cols-3">
        {(data?.plans ?? []).map((p) => {
          const Icon = planIcons[p.slug] ?? Sparkles;
          const isCurrent = sub?.plan_id === p.id;
          return (
            <Card key={p.id} className={p.featured ? "border-primary shadow-lg relative" : ""}>
              {p.featured && <Badge className="absolute -top-2 right-4">Mais popular</Badge>}
              <CardHeader>
                <Icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle>{p.name}</CardTitle>
                <div className="text-3xl font-bold">{brl(p.price_cents)}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                <CardDescription>{p.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Até {p.max_chips} chips simultâneos</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {p.max_messages_per_day.toLocaleString("pt-BR")} mensagens/dia</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Aquecimento automático</div>
                <div className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Marketplace de chips</div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={isCurrent ? "outline" : p.featured ? "default" : "outline"} disabled>
                  {isCurrent ? "Plano atual" : "Em breve (Stripe)"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          💳 Os pagamentos via Stripe serão ativados em breve. Por enquanto, todos os usuários têm acesso liberado pra testar.
        </CardContent>
      </Card>
    </div>
  );
}
