// Gate de rotas administrativas — verifica role 'admin' no servidor.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkIsAdminFn } from "@/lib/security.functions";

export const Route = createFileRoute("/_authenticated/_admin")({
  beforeLoad: async () => {
    try {
      const res = await checkIsAdminFn();
      if (!res.isAdmin) throw redirect({ to: "/app" });
    } catch (e) {
      if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      throw redirect({ to: "/app" });
    }
  },
  component: () => <Outlet />,
});
