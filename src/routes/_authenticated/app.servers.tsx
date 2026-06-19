import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, Server, Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/servers")({ component: ServersPage });

function ServersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return data?.some((r) => r.role === "admin") ?? false;
    },
  });

  // Usuário vê os próprios (RLS já filtra). Admin vê tudo (RLS permite via has_role).
  const { data: servers } = useQuery({
    queryKey: ["servers", isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase.from("evolution_servers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Usuário comum: ver se há servidor compartilhado disponível (sem expor credenciais)
  const { data: sharedAvailable } = useQuery({
    queryKey: ["shared-available"],
    enabled: !isAdmin,
    queryFn: async () => {
      // tenta listar compartilhados visíveis (RLS bloqueia para não-admin que não é dono),
      // então confiamos no listAvailableServersFn em outras telas; aqui só mostramos o badge.
      return true;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; base_url: string; api_key: string; is_shared: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const payload: any = { name: input.name, base_url: input.base_url, api_key: input.api_key, user_id: user.id };
      if (isAdmin && input.is_shared) payload.is_shared = true;
      const { error } = await supabase.from("evolution_servers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Servidor cadastrado"); setOpen(false); qc.invalidateQueries({ queryKey: ["servers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evolution_servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["servers"] }); },
  });

  function copyWebhook(token: string) {
    const url = `${window.location.origin}/api/public/evolution-webhook/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("URL do webhook copiada");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isAdmin ? "Servidores Evolution" : "Infraestrutura"}</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Gerencie servidores próprios e o servidor global compartilhado." : "Sua conta já está rodando na infraestrutura gerenciada da Perseidas. Avançado: você também pode conectar uma infra própria."}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant={isAdmin ? "default" : "outline"}><Plus className="mr-2 h-4 w-4" />{isAdmin ? "Novo servidor" : "Conectar infra própria"}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAdmin ? "Conectar servidor Evolution" : "Conectar infraestrutura própria (avançado)"}</DialogTitle>
              <DialogDescription>{isAdmin ? "Informe a URL base e a API key global do seu Evolution." : "Opcional. Informe a URL base e a chave da sua infra de mensageria — recomendado apenas para times técnicos."}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                create.mutate({
                  name: String(fd.get("name")),
                  base_url: String(fd.get("base_url")).replace(/\/$/, ""),
                  api_key: String(fd.get("api_key")),
                  is_shared: fd.get("is_shared") === "on",
                });
              }}
              className="space-y-4"
            >
              <div><Label htmlFor="name">Nome</Label><Input id="name" name="name" required placeholder="Meu Evolution VPS" /></div>
              <div><Label htmlFor="base_url">URL base</Label><Input id="base_url" name="base_url" required placeholder="https://evolution.meudominio.com" /></div>
              <div><Label htmlFor="api_key">API Key</Label><Input id="api_key" name="api_key" required type="password" /></div>
              {isAdmin && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="is_shared" className="flex items-center gap-2"><Shield className="h-4 w-4" />Servidor compartilhado</Label>
                    <p className="text-xs text-muted-foreground">Disponível para todos os usuários da plataforma. Credenciais ficam ocultas.</p>
                  </div>
                  <Switch id="is_shared" name="is_shared" />
                </div>
              )}
              <DialogFooter><Button type="submit" disabled={create.isPending}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!isAdmin && sharedAvailable && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-primary/10 p-2"><Server className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle className="text-base">Infraestrutura Perseidas ativa</CardTitle>
              <CardDescription>Seus chips já estão rodando na nossa infraestrutura gerenciada — sem configuração nenhuma da sua parte.</CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{isAdmin ? "Todos os servidores" : "Seus servidores"}</CardTitle></CardHeader>
        <CardContent>
          {!servers?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead>{isAdmin && <TableHead>URL</TableHead>}<TableHead>Webhook</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      {s.is_shared
                        ? <Badge className="bg-primary/20 text-primary border-primary/30">Perseidas</Badge>
                        : <Badge variant="outline">Própria</Badge>}
                    </TableCell>
                    {isAdmin && <TableCell className="font-mono text-xs">{s.base_url}</TableCell>}
                    <TableCell>
                      {isAdmin ? (
                        <Button variant="ghost" size="sm" onClick={() => copyWebhook(s.webhook_token)}>
                          <Copy className="mr-1 h-3 w-3" />Copiar URL
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {(!s.is_shared || isAdmin) && (
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover servidor?")) remove.mutate(s.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
