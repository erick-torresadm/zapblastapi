import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/servers")({ component: ServersPage });

function ServersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("evolution_servers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; base_url: string; api_key: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("evolution_servers").insert({ ...input, user_id: user.id });
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
          <h1 className="text-2xl font-bold">Servidores Evolution</h1>
          <p className="text-sm text-muted-foreground">Endpoints HTTP onde seus chips estão hospedados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo servidor</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar servidor Evolution</DialogTitle>
              <DialogDescription>Informe a URL base e a API key global do seu Evolution.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                create.mutate({
                  name: String(fd.get("name")),
                  base_url: String(fd.get("base_url")).replace(/\/$/, ""),
                  api_key: String(fd.get("api_key")),
                });
              }}
              className="space-y-4"
            >
              <div><Label htmlFor="name">Nome</Label><Input id="name" name="name" required placeholder="Meu Evolution VPS" /></div>
              <div><Label htmlFor="base_url">URL base</Label><Input id="base_url" name="base_url" required placeholder="https://evolution.meudominio.com" /></div>
              <div><Label htmlFor="api_key">API Key</Label><Input id="api_key" name="api_key" required type="password" /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Servidores conectados</CardTitle></CardHeader>
        <CardContent>
          {!servers?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>URL</TableHead><TableHead>Webhook</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.base_url}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => copyWebhook(s.webhook_token)}>
                        <Copy className="mr-1 h-3 w-3" />Copiar URL
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover servidor?")) remove.mutate(s.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
