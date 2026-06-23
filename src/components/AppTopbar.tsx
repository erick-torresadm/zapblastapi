import { Link, useRouterState } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Sparkles, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";


const LABELS: Record<string, string> = {
  profile: "Meu perfil",
  app: "Dashboard",

  servers: "Servidores",
  instances: "Chips",
  warmup: "Aquecimento",
  lists: "Contatos",
  campaigns: "Campanhas",
  inbox: "Respostas",
  marketplace: "Marketplace",
  wallet: "Carteira",
  billing: "Planos",
  admin: "Admin",
  catalog: "Catálogo",
  "anti-ban": "Anti-ban",
  new: "Novo",
};

export function AppTopbar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const parts = path.split("/").filter(Boolean);

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { data } = await supabase.from("wallets").select("balance_cents").eq("user_id", u.user.id).maybeSingle();
      return data?.balance_cents ?? 0;
    },
  });

  const { data: planInfo } = useQuery({
    queryKey: ["current-plan-badge"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, subscription_plans(name, price_cents)")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Cheapest available plan, used as reference when user has no plan
      const { data: cheapest } = await supabase
        .from("subscription_plans")
        .select("name, price_cents")
        .eq("is_active", true)
        .gt("price_cents", 0)
        .order("price_cents", { ascending: true })
        .limit(1)
        .maybeSingle();
      const fallback = cheapest ? { name: cheapest.name as string, price_cents: cheapest.price_cents as number } : null;
      if (!data) return { name: "Sem plano", status: "none" as const, price_cents: null as number | null, trial_ends_at: null as string | null, fallback };
      const sp = (data as { subscription_plans?: { name?: string; price_cents?: number } }).subscription_plans;
      return {
        name: sp?.name ?? "Sem plano",
        status: (data.status as string) ?? "none",
        price_cents: sp?.price_cents ?? null,
        trial_ends_at: (data as { trial_ends_at?: string | null }).trial_ends_at ?? null,
        fallback,
      };
    },
    refetchInterval: 60000,
  });

  const trialDaysLeft = (() => {
    if (!planInfo?.trial_ends_at) return null;
    const ms = new Date(planInfo.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
  })();
  const isTrialing = planInfo?.status === "trialing";
  const noPlan = planInfo?.status === "none" || planInfo?.status === "past_due";
  const refPrice = isTrialing
    ? (planInfo?.price_cents ?? planInfo?.fallback?.price_cents ?? null)
    : noPlan
    ? (planInfo?.fallback?.price_cents ?? null)
    : (planInfo?.price_cents ?? null);
  const priceLabel = refPrice != null ? `R$ ${(refPrice / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês` : null;


  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/70 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      {/* Mobile: só o último segmento, truncado */}
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm sm:hidden">
        {parts.length > 0 && (
          <span className="truncate font-medium text-foreground">
            {LABELS[parts[parts.length - 1]] ?? parts[parts.length - 1]}
          </span>
        )}
      </nav>
      {/* sm+: breadcrumb completo */}
      <nav className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm sm:flex">
        {parts.map((p, i) => {
          const to = "/" + parts.slice(0, i + 1).join("/");
          const last = i === parts.length - 1;
          const label = LABELS[p] ?? p;
          return (
            <span key={to} className="flex items-center gap-1.5 truncate">
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              {last ? (
                <span className="truncate font-medium text-foreground">{label}</span>
              ) : (
                <Link to={to} className="truncate text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
              )}
            </span>
          );
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          to="/app/wallet"
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary sm:px-3"
        >
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <span className="tabular-nums">R$ {((wallet ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
        </Link>
        <Link
          to="/app/billing"
          className="hidden sm:flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          title="Seu plano atual"
        >
          <Crown className="h-3.5 w-3.5" />
          <span>Plano:&nbsp;<strong>{planInfo?.name ?? "…"}</strong></span>
          {planInfo?.status === "trialing" && (
            <Badge variant="outline" className="ml-1 border-warning/40 bg-warning/10 text-warning text-[10px] px-1.5 py-0">Teste</Badge>
          )}
          {(planInfo?.status === "none" || planInfo?.status === "past_due") && (
            <Sparkles className="ml-0.5 h-3 w-3" />
          )}
        </Link>

      </div>
    </header>
  );
}
