import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const getNextLink = createServerFn({ method: "GET" })
  .inputValidator((i: { slug: string }) => z.object({ slug: z.string().min(1).max(60) }).parse(i))
  .handler(async ({ data }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabase.rpc("public_get_next_group_link" as never, { _slug: data.slug } as never);
    if (error) return { url: null as string | null };
    const arr = (rows ?? []) as Array<{ invite_url: string | null }>;
    return { url: arr[0]?.invite_url ?? null };
  });

export const Route = createFileRoute("/g/$slug")({
  loader: async ({ params }) => {
    const { url } = await getNextLink({ data: { slug: params.slug } });
    if (url) throw redirect({ href: url });
    return { url: null };
  },
  component: NoSlot,
  head: () => ({
    meta: [
      { title: "Entrando no grupo…" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function NoSlot() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-bold">Em breve</h1>
        <p className="text-muted-foreground">
          Nenhuma vaga disponível agora. Fique de olho — abrimos novos grupos em instantes.
        </p>
      </div>
    </div>
  );
}
