import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Check, X, Loader2 } from "lucide-react";
import { previewInviteFn, acceptInviteFn } from "@/lib/invites.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/convite/$token")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Convite • Perseidas" },
      { name: "description", content: "Você foi convidado para entrar em um time na Perseidas — aceite o convite e comece a atender no WhatsApp." },
      { property: "og:title", content: "Convite • Perseidas" },
      { property: "og:description", content: "Você foi convidado para entrar em um time na Perseidas." },
      { property: "og:locale", content: "pt_BR" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});


function InvitePage() {
  const { token } = Route.useParams();
  const preview = useServerFn(previewInviteFn);
  const accept = useServerFn(acceptInviteFn);
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    preview({ data: { token } }).then(setData).catch((e) => setData({ valid: false, message: e.message })).finally(() => setLoading(false));
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, [token]);

  const onAccept = async () => {
    setAccepting(true);
    try {
      const r = await accept({ data: { token } });
      if (!r.ok) { toast.error(r.message ?? "Erro"); return; }
      toast.success("Convite aceito! Bem-vindo à equipe.");
      navigate({ to: "/app/inbox" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="mt-3">Convite para equipe</CardTitle>
          <CardDescription>Você foi convidado para colaborar no CRM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

          {!loading && data && !data.valid && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-4 text-destructive">
              <X className="h-5 w-5" /><span>{data.message ?? "Link inválido"}</span>
            </div>
          )}

          {!loading && data?.valid && (
            <>
              <div className="space-y-2 rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Convidado por</div>
                <div className="font-medium">{data.owner_name ?? "Workspace"}</div>
                <Badge variant="secondary" className="capitalize">Papel: {data.role}</Badge>
              </div>

              {authed === null && <div className="text-center text-sm text-muted-foreground">Verificando sessão…</div>}

              {authed === false && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground text-center">
                    Faça login ou crie sua conta para aceitar.
                  </p>
                  <Button asChild className="w-full">
                    <Link to="/auth" search={{ redirect: `/convite/${token}` } as any}>Entrar / Cadastrar</Link>
                  </Button>
                </div>
              )}

              {authed === true && (
                <Button onClick={onAccept} disabled={accepting} className="w-full">
                  {accepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Aceitar convite
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
