import { Link, useRouterState } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
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

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
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
      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/app/wallet"
          className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary sm:flex"
        >
          <Wallet className="h-3.5 w-3.5 text-primary" />
          R$ {((wallet ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </Link>
        <Link to="/app/billing">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">
            <Sparkles className="mr-1 h-3 w-3" /> Upgrade
          </Badge>
        </Link>
      </div>
    </header>
  );
}
