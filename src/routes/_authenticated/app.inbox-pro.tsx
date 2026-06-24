import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Settings, Sparkles, Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getChatwootConnectionFn, provisionChatwootFn, getChatwootSsoUrlFn,
} from "@/lib/chatwoot.functions";

export const Route = createFileRoute("/_authenticated/app/inbox-pro")({ component: InboxProPage });

function InboxProPage() {
  const qc = useQueryClient();
  const getConn = useServerFn(getChatwootConnectionFn);
  const provisionFn = useServerFn(provisionChatwootFn);
  const ssoFn = useServerFn(getChatwootSsoUrlFn);

  const { data, isLoading } = useQuery({ queryKey: ["chatwoot-conn"], queryFn: () => getConn() });
  const conn = data?.connection;

  const provision = useMutation({
    mutationFn: () => provisionFn(),
    onSuccess: () => {
      toast.success("Inbox Pro ativado ✓");
      qc.invalidateQueries({ queryKey: ["chatwoot-conn"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: sso } = useQuery({
    queryKey: ["chatwoot-sso"],
    queryFn: () => ssoFn(),
    enabled: !!conn,
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="rounded-full bg-primary/10 p-6">
          <Headphones className="h-12 w-12 text-primary" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl font-bold">Inbox Pro</h1>
            <Badge className="bg-amber-500/15 text-amber-600">Beta</Badge>
          </div>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Helpdesk multi-agente com fila, atribuições e respostas prontas.
            Seu workspace é criado em 1 clique e fica totalmente isolado.
          </p>
        </div>
        <Button size="lg" onClick={() => provision.mutate()} disabled={provision.isPending}>
          {provision.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Ativar meu Inbox Pro
        </Button>
        <Alert className="text-left">
          <AlertDescription className="text-xs">
            <strong>Como funciona:</strong> mensagens novas do WhatsApp viram conversas aqui.
            Respostas dos agentes saem pelo WhatsApp automaticamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <Embed ssoUrl={sso?.url ?? null} ok={conn.last_test_ok !== false} />;
}

function Embed({ ssoUrl, ok }: { ssoUrl: string | null; ok: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fallbackUrl = "https://chatwoot.membropro.com.br";

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!iframeRef.current?.dataset.loaded) setBlocked(true);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [ssoUrl]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Headphones className="h-4 w-4 text-primary" />
          <span className="font-medium">Inbox Pro</span>
          <Badge className="bg-amber-500/15 text-amber-600 text-[10px]">Beta</Badge>
          {ok ? (
            <Badge className="bg-emerald-500/15 text-emerald-600">conectado</Badge>
          ) : (
            <Badge variant="destructive">offline</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={ssoUrl ?? fallbackUrl} target="_blank" rel="noopener noreferrer">
              Abrir em nova aba <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/settings/chatwoot"><Settings className="mr-1 h-3 w-3" /> Configurar</Link>
          </Button>
        </div>
      </div>
      {blocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Seu Inbox Pro está bloqueando exibição embedada. Abra em nova aba —
            toda a sincronização continua funcionando.
          </p>
          <Button asChild>
            <a href={ssoUrl ?? fallbackUrl} target="_blank" rel="noopener noreferrer">
              Abrir meu Inbox Pro →
            </a>
          </Button>
        </div>
      ) : ssoUrl ? (
        <iframe
          ref={iframeRef}
          src={ssoUrl}
          title="Inbox Pro"
          className="flex-1 w-full border-0 bg-background"
          onLoad={(e) => { (e.currentTarget as HTMLIFrameElement).dataset.loaded = "1"; }}
          allow="clipboard-read; clipboard-write; microphone; camera"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando SSO…
        </div>
      )}
    </div>
  );
}
