import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Link2, Users, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listGroupCampaignsFn, createGroupCampaignFn, deleteGroupCampaignFn,
} from "@/lib/group-launcher.functions";
import { listInstancesFn } from "@/lib/instances.functions";

export const Route = createFileRoute("/_authenticated/app/group-launcher/")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGroupCampaignsFn);
  const removeFn = useServerFn(deleteGroupCampaignFn);

  const { data: campaigns } = useQuery({
    queryKey: ["group-campaigns"],
    queryFn: () => listFn({ data: undefined as never }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => { toast.success("Campanha removida"); qc.invalidateQueries({ queryKey: ["group-campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Group Launcher</h1>
          <p className="text-sm text-muted-foreground">
            Crie dezenas de grupos de uma vez. Compartilhe um único link — ele rotaciona quando enche.
          </p>
        </div>
        <NewCampaignButton />
      </div>

      {!campaigns?.length ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma campanha ainda. Crie a primeira para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="hover:border-primary/50 transition">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Ativa" : "Pausada"}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1 text-xs">
                  <Link2 className="h-3 w-3" />
                  <code className="rounded bg-muted px-1 py-0.5">/g/{c.slug}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> limite {c.member_limit}</span>
                  <span>{c.click_count} cliques</span>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link to="/app/group-launcher/$id" params={{ id: c.id }}>Gerenciar</Link>
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => window.open(`/g/${c.slug}`, "_blank")}
                    title="Testar link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { if (confirm("Remover esta campanha e todos os grupos?")) remove.mutate(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCampaignButton() {
  const qc = useQueryClient();
  const createFn = useServerFn(createGroupCampaignFn);
  const instancesFn = useServerFn(listInstancesFn);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(950);
  const [instanceId, setInstanceId] = useState<string>("");

  const { data: instances } = useQuery({
    queryKey: ["instances"],
    queryFn: () => instancesFn({ data: undefined as never }),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () => createFn({ data: { name, member_limit: limit, instance_id: instanceId || null } }),
    onSuccess: () => {
      toast.success("Campanha criada");
      qc.invalidateQueries({ queryKey: ["group-campaigns"] });
      setOpen(false); setName(""); setInstanceId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Nova campanha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova campanha de grupos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome do lançamento</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Black Friday 2026" />
          </div>
          <div>
            <Label>Instância (chip)</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger><SelectValue placeholder="Selecione um chip conectado" /></SelectTrigger>
              <SelectContent>
                {(instances ?? []).map((i: { id: string; instance_name: string }) => (
                  <SelectItem key={i.id} value={i.id}>{i.instance_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Este chip vai criar e administrar os grupos. Pode trocar depois.
            </p>
          </div>
          <div>
            <Label>Limite de membros por grupo</Label>
            <Input type="number" min={50} max={1024} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">
              Quando atingir esse número, o link público pula para o próximo grupo. WhatsApp aceita até 1024; recomendamos 950 de margem.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending}>
            {mut.isPending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
