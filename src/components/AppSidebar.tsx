import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Server, Smartphone, Users, Send, Inbox, LogOut, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/servers", label: "Servidores", icon: Server },
  { to: "/app/instances", label: "Chips", icon: Smartphone },
  { to: "/app/lists", label: "Contatos", icon: Users },
  { to: "/app/campaigns", label: "Campanhas", icon: Send },
  { to: "/app/inbox", label: "Respostas", icon: Inbox },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
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
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((n) => {
                const active = n.exact ? path === n.to : path.startsWith(n.to);
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
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
