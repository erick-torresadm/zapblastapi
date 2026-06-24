import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Settings, Sparkles, Zap, Loader2 } from "lucide-react";
import { getTwentyConnectionFn } from "@/lib/twenty.functions";

export const Route = createFileRoute("/_authenticated/app/crm-vendas")({ component: CrmVendasPage });

function CrmVendasPage() {
  const getConn = useServerFn(getTwentyConnectionFn);
  const { data, isLoading } = useQuery({ queryKey: ["twenty-conn"], queryFn: () => getConn() });
  const conn = data?.connection;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conn || !conn.enabled || !conn.base_url) {
    return <Onboarding />;
  }

  return <Embed url={conn.base_url} ok={conn.last_test_ok !== false} />;
}

function Onboarding() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-full bg-primary/10 p-6">
        <Zap className="h-12 w-12 text-primary" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-bold">CRM Vendas</h1>
          <Badge className="bg-amber-500/15 text-amber-600">Beta</Badge>
        </div>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Pipeline de vendas privativo, com deals, contatos e notas sincronizadas com seu WhatsApp.
          Cada usuário tem seu próprio workspace — totalmente isolado.
        </p>
      </div>
      <Button size="lg" asChild>
        <Link to="/app/settings/twenty">
          <Sparkles className="mr-2 h-4 w-4" /> Ativar meu CRM Vendas
        </Link>
      </Button>
      <Alert className="text-left">
        <AlertDescription className="text-xs">
          <strong>Como funciona:</strong> você conecta seu workspace (URL + API key) na próxima tela.
          A partir daí toda mensagem nova do WhatsApp vira nota automaticamente no contato correspondente.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function Embed({ url, ok }: { url: string; ok: boolean }) {
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!iframeRef.current?.dataset.loaded) setBlocked(true);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [url]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-medium">CRM Vendas</span>
          <Badge className="bg-amber-500/15 text-amber-600 text-[10px]">Beta</Badge>
          {ok ? (
            <Badge className="bg-emerald-500/15 text-emerald-600">conectado</Badge>
          ) : (
            <Badge variant="destructive">offline</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Abrir em nova aba <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/settings/twenty"><Settings className="mr-1 h-3 w-3" /> Configurar</Link>
          </Button>
        </div>
      </div>
      {blocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Seu CRM está bloqueando exibição dentro do Perseidas (X-Frame-Options).
            Abra em nova aba — toda a sincronização continua funcionando.
          </p>
          <Button asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Abrir meu CRM Vendas →
            </a>
          </Button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={url}
          title="CRM Vendas"
          className="flex-1 w-full border-0 bg-background"
          onLoad={(e) => { (e.currentTarget as HTMLIFrameElement).dataset.loaded = "1"; }}
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
