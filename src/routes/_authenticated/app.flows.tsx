import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus, Workflow, Edit3, Copy, Trash2, Play, Pause, Sparkles, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  listFlowsFn, createFlowFn, duplicateFlowFn, toggleFlowStatusFn, deleteFlowFn,
} from "@/lib/flows.functions";
import { FLOW_TEMPLATES } from "@/lib/flow-templates";

export const Route = createFileRoute("/_authenticated/app/flows")({
  component: FlowsListPage,
});

const triggerLabel: Record<string, string> = {
  manual: "Manual",
  keyword: "Palavra-chave",
  new_contact: "Contato novo",
  list_added: "Contato em lista",
  api: "API",
};

function FlowsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const listFn = useServerFn(listFlowsFn);
  const createFn = useServerFn(createFlowFn);
  const dupFn = useServerFn(duplicateFlowFn);
  const toggleFn = useServerFn(toggleFlowStatusFn);
  const delFn = useServerFn(deleteFlowFn);

  const { data: flows, isLoading } = useQuery({
    queryKey: ["flows"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: (input: { name?: string; template?: any }) => createFn({ data: input }),
    onSuccess: (r) => { setOpen(false); setNewName(""); navigate({ to: "/app/flows/$id", params: { id: r.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { toast.success("Duplicado"); qc.invalidateQueries({ queryKey: ["flows"] }); },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "paused" }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flows"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["flows"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fluxos</h1>
          <p className="text-sm text-muted-foreground">Automatize conversas com gatilhos, condições e IA</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo fluxo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Como você quer começar?</DialogTitle>
              <DialogDescription>Use um template pronto ou comece do zero.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => createMut.mutate({ name: newName || "Novo fluxo" })}
                disabled={createMut.isPending}
                className="group flex flex-col items-start gap-2 rounded-xl border-2 border-dashed border-border p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold">Começar do zero</div>
                  <div className="text-xs text-muted-foreground">Canvas vazio para construir do seu jeito</div>
                </div>
              </button>

              {FLOW_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => createMut.mutate({ name: newName || t.name, template: { nodes: t.nodes, edges: t.edges } })}
                  disabled={createMut.isPending}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-lg">
                    {t.emoji}
                  </div>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Nome do fluxo (opcional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : !flows?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5">
              <Workflow className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Nenhum fluxo ainda</CardTitle>
              <CardDescription>Crie seu primeiro fluxo a partir de um template ou em branco.</CardDescription>
            </div>
            <Button onClick={() => setOpen(true)}><Sparkles className="mr-2 h-4 w-4" />Criar primeiro fluxo</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f: any) => {
            const completionRate = f.stats.total ? Math.round((f.stats.done / f.stats.total) * 100) : 0;
            return (
              <Card key={f.id} className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate text-base">{f.name}</CardTitle>
                    <Badge variant={f.status === "active" ? "default" : f.status === "paused" ? "secondary" : "outline"}>
                      {f.status === "active" ? "Ativo" : f.status === "paused" ? "Pausado" : "Rascunho"}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2 text-xs">{f.description ?? `Disparado por: ${triggerLabel[f.trigger_type] ?? f.trigger_type}`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-lg font-bold">{f.stats.total}</div><div className="text-[10px] uppercase text-muted-foreground">execuções 7d</div></div>
                    <div><div className="text-lg font-bold text-emerald-500">{completionRate}%</div><div className="text-[10px] uppercase text-muted-foreground">concluídas</div></div>
                    <div><div className="text-lg font-bold text-amber-500">{f.stats.running}</div><div className="text-[10px] uppercase text-muted-foreground">rodando</div></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button asChild size="sm" className="flex-1">
                      <Link to="/app/flows/$id" params={{ id: f.id }}>
                        <Edit3 className="mr-2 h-3.5 w-3.5" />Editar
                        <ArrowRight className="ml-auto h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {f.status !== "draft" && (
                      <Button variant="outline" size="icon" title={f.status === "active" ? "Pausar" : "Ativar"}
                        onClick={() => toggleMut.mutate({ id: f.id, status: f.status === "active" ? "paused" : "active" })}>
                        {f.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    <Button variant="outline" size="icon" title="Duplicar" onClick={() => dupMut.mutate(f.id)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" title="Excluir"
                      onClick={() => { if (confirm(`Excluir "${f.name}"?`)) delMut.mutate(f.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
