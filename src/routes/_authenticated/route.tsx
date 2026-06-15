import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger />
        </div>
        <div className="container mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
}
