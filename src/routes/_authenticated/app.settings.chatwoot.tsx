import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  getChatwootConnectionFn, provisionChatwootFn, testChatwootConnectionFn,
  setChatwootTogglesFn, disconnectChatwootFn,
} from "@/lib/chatwoot.functions";

export const Route = createFileRoute("/_authenticated/app/settings/chatwoot")({ component: ChatwootSettings });

function ChatwootSettings() {
  const qc = useQueryClient();
  const getConn = useServerFn(getChatwootConnectionFn);
  const provisionFn = useServerFn(provisionChatwootFn);
  const testFn = useServerFn(testChatwootConnectionFn);
  const togglesFn = useServerFn(setChatwootTogglesFn);
  const disconnectFn = useServerFn(disconnectChatwootFn);

  const { data: connData } = useQuery({ queryKey: ["chatwoot-conn"], queryFn: () => getConn() });
  const conn = connData?.connection;

  const [enabled, setEnabled] = useState(false);
  const [replaceInbox, setReplaceInbox] = useState(false);

  if (conn && enabled !== conn.enabled) queueMicrotask(() => setEnabled(conn.enabled));
  if (conn && replaceInbox !== conn.replace_inbox) queueMicrotask(() => setReplaceInbox(conn.replace_inbox));

  const provision = useMutation({
    mutationFn: () => provisionFn(),
    onSuccess: (res) => {
      toast.success(`Conta criada no Chatwoot ✓ (${res.email})`);
      qc.invalidateQueries({ queryKey: ["chatwoot-conn"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (res) => {
      if (res.ok) toast.success("Conexão OK ✓");
      else toast.error(`Falhou: ${res.error}`);
      qc.invalidateQueries({ queryKey: ["chatwoot-conn"] });
    },
  });

  const saveToggles = useMutation({
    mutationFn: (vars: { enabled: boolean; replace_inbox: boolean }) => togglesFn({ data: vars }),
    onSuccess: () => {
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["chatwoot-conn"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Desconectado");
      qc.invalidateQueries({ queryKey: ["chatwoot-conn"] });
    },
  });

  const chatwootUrl = "https://chatwoot.membropro.com.br";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/profile"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageCircle className="h-6 w-6 text-primary" /> Chatwoot
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecte com 1 clique seu próprio workspace no Chatwoot. Mensagens do WhatsApp
          (do QR que você escaneou aqui) viram conversas no Chatwoot automaticamente, e
          respostas dos agentes no Chatwoot saem pelo WhatsApp.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Cada usuário do Perseidas tem sua própria conta e workspace isolados —
          provisionados automaticamente quando você clica em "Conectar".
        </p>
      </div>

      {!conn ? (
        <Card>
          <CardHeader>
            <CardTitle>Conectar Chatwoot</CardTitle>
            <CardDescription>
              Vamos criar automaticamente uma conta e workspace pra você em <code>{chatwootUrl}</code>.
              Leva 2 segundos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" onClick={() => provision.mutate()} disabled={provision.isPending}>
              {provision.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Conectar meu Chatwoot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Sua conexão</span>
              {conn.last_test_ok === true && <Badge className="bg-emerald-500/15 text-emerald-600">conectado</Badge>}
              {conn.last_test_ok === false && <Badge variant="destructive">offline</Badge>}
            </CardTitle>
            <CardDescription>
              Conta Chatwoot #{conn.chatwoot_account_id} • {conn.email_used}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar sincronização</Label>
                <p className="text-xs text-muted-foreground">Mensagens do WhatsApp viram conversas no Chatwoot.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); saveToggles.mutate({ enabled: v, replace_inbox: replaceInbox }); }} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Substituir aba Conversas pelo Chatwoot</Label>
                <p className="text-xs text-muted-foreground">A aba CRM mostra o Chatwoot embedado (ou link, se bloqueado).</p>
              </div>
              <Switch checked={replaceInbox} onCheckedChange={(v) => { setReplaceInbox(v); saveToggles.mutate({ enabled, replace_inbox: v }); }} />
            </div>

            {conn.last_test_error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>Último teste: {conn.last_test_error}</AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Testar conexão
              </Button>
              <Button variant="outline" asChild>
                <a href={chatwootUrl} target="_blank" rel="noopener noreferrer">
                  Abrir Chatwoot <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
              <Button variant="ghost" className="text-destructive ml-auto" onClick={() => {
                if (confirm("Remove a conexão local? A conta no Chatwoot permanece.")) disconnect.mutate();
              }}>
                <Trash2 className="mr-1 h-4 w-4" /> Desconectar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Iframe bloqueado?</strong> Chatwoot responde com <code>X-Frame-Options: SAMEORIGIN</code>.
          Pra mostrar embedado dentro do Perseidas, configure a env var{" "}
          <code>FRAME_ANCESTORS="self perseidas.com.br *.lovable.app *.lovable-project.com"</code>{" "}
          no container Chatwoot e reinicie. Senão a aba Conversas mostra botão pra abrir em nova aba.
        </AlertDescription>
      </Alert>
    </div>
  );
}
