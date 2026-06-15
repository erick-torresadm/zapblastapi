import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Server, Smartphone, Users, Send, Inbox,
  LogOut, Zap, Flame, ShoppingCart, Wallet, CreditCard, Shield, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const operationNav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/instances", label: "Chips", icon: Smartphone },
  { to: "/app/warmup", label: "Aquecimento", icon: Flame },
  { to: "/app/lists", label: "Contatos", icon: Users },
  { to: "/app/campaigns", label: "Campanhas", icon: Send },
  { to: "/app/inbox", label: "Respostas", icon: Inbox },
  { to: "/app/anti-ban", label: "Anti-ban", icon: ShieldCheck },
  { to: "/app/servers", label: "Servidores", icon: Server },
];
const accountNav = [
  { to: "/app/marketplace", label: "Marketplace", icon: ShoppingCart },
  { to: "/app/wallet", label: "Carteira", icon: Wallet },
  { to: "/app/billing", label: "Planos", icon: CreditCard },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return (data ?? []).some((r) => r.role === "admin");
    },
  });

  const { data: status } = useQuery({
    queryKey: ["instances-status"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_instances").select("status");
      const all = data ?? [];
      const connected = all.filter((i) => i.status === "connected").length;
      return { connected, total: all.length };
    },
    refetchInterval: 15000,
  });

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  function renderItems(items: typeof operationNav) {
    return items.map((n) => {
      const active = ("exact" in n && n.exact) ? path === n.to : path.startsWith(n.to);
      const Icon = n.icon;
      return (
        <SidebarMenuItem key={n.to}>
          <SidebarMenuButton
            asChild
            isActive={active}
            className="group relative h-9 rounded-lg data-[active=true]:bg-sidebar-accent/80 data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"
          >
            <Link to={n.to}>
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary shadow-[0_0_8px_var(--color-primary)]" />
              )}
              <Icon className="h-4 w-4" />
              <span>{n.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <Sidebar className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link to="/app" className="flex items-center gap-2.5 px-2 py-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_0_20px_-2px_var(--color-primary)]">
            <Zap className="h-4.5 w-4.5 fill-white text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold tracking-tight">ZapBlast</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Anti-ban Suite</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Operação
          </SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(operationNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Conta
          </SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(accountNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={path.startsWith("/app/admin")} className="h-9 rounded-lg">
                    <Link to="/app/admin/catalog">
                      <Shield className="h-4 w-4" />
                      <span>Catálogo</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-2">
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 px-2.5 py-2">
          <div className="relative">
            <span className={`block h-2 w-2 rounded-full ${(status?.connected ?? 0) > 0 ? "bg-success" : "bg-muted-foreground"}`} />
            {(status?.connected ?? 0) > 0 && (
              <span className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-success" />
            )}
          </div>
          <div className="flex-1 text-xs leading-tight">
            <div className="font-medium">{status?.connected ?? 0}/{status?.total ?? 0} online</div>
            <div className="text-[10px] text-muted-foreground">Chips conectados</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary-glow/80 text-[11px] font-bold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-medium">{user?.email ?? "—"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="h-7 w-7 text-muted-foreground hover:text-destructive">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
