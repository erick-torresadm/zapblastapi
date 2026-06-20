import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache "fresco" por 30s — evita refetch ao alternar entre páginas
        staleTime: 30_000,
        // Mantém no cache por 5min após desmonte
        gcTime: 5 * 60_000,
        // Não refaz fetch ao focar a janela (alivia rede e CPU)
        refetchOnWindowFocus: false,
        // Retry só 1 vez (default era 3 — atrasava bastante em erros)
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload no hover/touch para reduzir o delay percebido
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
