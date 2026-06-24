import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  getTwentyConnectionFn, saveTwentyConnectionFn, testTwentyConnectionFn,
  disconnectTwentyFn, getTwentySyncStatsFn,
} from "@/lib/twenty.functions";

export const Route = createFileRoute("/_authenticated/app/settings/twenty")({ component: TwentySettings });

function TwentySettings() {
  const qc = useQueryClient();
  const getConn = useServerFn(getTwentyConnectionFn);
  const saveFn = useServerFn(saveTwentyConnectionFn);
  const testFn = useServerFn(testTwentyConnectionFn);
  const disconnectFn = useServerFn(disconnectTwentyFn);
  const statsFn = useServerFn(getTwentySyncStatsFn);

  const { data: connData } = useQuery({ queryKey: ["twenty-conn"], queryFn: () => getConn() });
  const conn = connData?.connection;
  const { data: stats } = useQuery({ queryKey: ["twenty-stats"], queryFn: () => statsFn(), enabled: !!conn?.enabled, refetchInterval: 15000 });

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [replaceInbox, setReplaceInbox] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  // hydrate uma vez
  if (conn && baseUrl === "" && !editingKey) {
    queueMicrotask(() => {
      setBaseUrl(conn.base_url);
      setWorkspaceId(conn.workspace_id ?? "");
      setEnabled(conn.enabled);
      setReplaceInbox(conn.replace_inbox);
    });
  }

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      base_url: baseUrl, api_key: editingKey || !conn ? apiKey : "",
      workspace_id: workspaceId || null, enabled, replace_inbox: replaceInbox,
    } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Conexão salva ✓");
      else toast.error(`Salvo mas teste falhou: ${res.error}`);
      setApiKey(""); setEditingKey(false);
      qc.invalidateQueries({ queryKey: ["twenty-conn"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (res) => {
      if (res.ok) toast.success("Conexão OK ✓");
      else toast.error(`Falhou: ${res.error}`);
      qc.invalidateQueries({ queryKey: ["twenty-conn"] });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Desconectado");
      setBaseUrl(""); setApiKey(""); setWorkspaceId(""); setEnabled(false); setReplaceInbox(false);
      qc.invalidateQueries({ queryKey: ["twenty-conn"] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/profile"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Twenty CRM</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua instância <strong>self-hosted</strong> do Twenty pra substituir o CRM interno do ZapBlast.
          Cada novo contato e mensagem do WhatsApp vira automaticamente atividade no Twenty.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Conexão</span>
            {conn?.last_test_ok === true && <Badge className="bg-emerald-500/15 text-emerald-600">conectado</Badge>}
            {conn?.last_test_ok === false && <Badge variant="destructive">falhou</Badge>}
          </CardTitle>
          <CardDescription>Pegue a API Key em Settings → Developers → API Keys no seu Twenty.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL base</Label>
            <Input
              placeholder="https://crm.exemplo.com.br"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>API Key {conn && !editingKey && <span className="text-xs text-muted-foreground">(salva, criptografada)</span>}</Label>
            {conn && !editingKey ? (
              <div className="flex gap-2">
                <Input value="••••••••••••••••••••••••" disabled />
                <Button type="button" variant="outline" onClick={() => setEditingKey(true)}>Substituir</Button>
              </div>
            ) : (
              <Input
                type="password"
                placeholder="eyJhbGciOi..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Workspace ID <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <Input
              placeholder="ex: 05499097-..."
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Ativar sincronização</Label>
              <p className="text-xs text-muted-foreground">Mensagens novas viram nota no Twenty automaticamente.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Substituir aba Conversas pelo Twenty</Label>
              <p className="text-xs text-muted-foreground">A aba CRM vira um atalho que abre o Twenty.</p>
            </div>
            <Switch checked={replaceInbox} onCheckedChange={setReplaceInbox} />
          </div>

          {conn?.last_test_error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>Último teste: {conn.last_test_error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !baseUrl}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
            {conn && (
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Testar conexão
              </Button>
            )}
            {conn?.base_url && (
              <Button variant="outline" asChild>
                <a href={conn.base_url} target="_blank" rel="noopener noreferrer">
                  Abrir Twenty <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            )}
            {conn && (
              <Button variant="ghost" className="text-destructive ml-auto" onClick={() => {
                if (confirm("Tem certeza? A integração será removida.")) disconnect.mutate();
              }}>
                <Trash2 className="mr-1 h-4 w-4" /> Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {conn?.enabled && stats && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sincronização</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.done_24h}</div>
              <div className="text-xs text-muted-foreground">enviadas 24h</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">na fila</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">com erro</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Importante:</strong> sua API key é guardada criptografada (AES) e só é descriptografada server-side pelo worker.
          Se o seu Twenty rodar em <code>localhost</code>, o ZapBlast publicado não consegue alcançá-lo —
          use um domínio público (ex: ngrok, Cloudflare Tunnel ou VPS).
        </AlertDescription>
      </Alert>
    </div>
  );
}
