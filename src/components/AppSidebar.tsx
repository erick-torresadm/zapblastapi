import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Server, Smartphone, Users, Send, Inbox, LogOut, Zap, Flame, ShoppingCart, Wallet, CreditCard, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/servers", label: "Servidores", icon: Server },
  { to: "/app/instances", label: "Chips", icon: Smartphone },
  { to: "/app/warmup", label: "Aquecimento", icon: Flame },
  { to: "/app/lists", label: "Contatos", icon: Users },
  { to: "/app/campaigns", label: "Campanhas", icon: Send },
  { to: "/app/inbox", label: "Respostas", icon: Inbox },
];
const billingNav = [
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

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  function renderItems(items: typeof nav) {
    return items.map((n) => {
      const active = ("exact" in n && n.exact) ? path === n.to : path.startsWith(n.to);
      const Icon = n.icon;
      return (
        <SidebarMenuItem key={n.to}>
          <SidebarMenuButton asChild isActive={active}>
            <Link to={n.to}>
              <Icon className="h-4 w-4" />
              <span>{n.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          <div className="font-semibold">ZapBlast</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(nav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Conta</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{renderItems(billingNav)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path.startsWith("/app/admin")}>
                  <Link to="/app/admin/catalog"><Shield className="h-4 w-4" /><span>Catálogo</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
