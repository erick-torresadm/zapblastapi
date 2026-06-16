import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Bot, Pencil, Clock, User } from "lucide-react";
import { toast } from "sonner";
import {
  listKeywordTriggersFn, upsertKeywordTriggerFn, toggleKeywordTriggerFn,
  deleteKeywordTriggerFn, listFlowsForKeywordsFn,
} from "@/lib/keywords.functions";

export const Route = createFileRoute("/_authenticated/app/keywords")({
  component: KeywordsPage,
});

type Trigger = {
  id: string; user_id: string; flow_id: string; instance_id: string | null;
  keywords: string[]; match_mode: "exact" | "contains" | "starts_with"; active: boolean;
  created_by_admin: boolean; flow_name: string;
  instance: { id: string; instance_name: string; status: string } | null;
};

const matchLabel: Record<string, string> = {
  exact: "Exato", contains: "Contém", starts_with: "Começa com",
};

function KeywordsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listKeywordTriggersFn);
  const optsFn = useServerFn(listFlowsForKeywordsFn);
  const saveFn = useServerFn(upsertKeywordTriggerFn);
  const toggleFn = useServerFn(toggleKeywordTriggerFn);
  const delFn = useServerFn(deleteKeywordTriggerFn);

  const { data: list, isLoading } = useQuery({ queryKey: ["kw-triggers"], queryFn: () => listFn() });
  const { data: opts } = useQuery({ queryKey: ["kw-opts"], queryFn: () => optsFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [form, setForm] = useState({
    flow_id: "", instance_id: "", keywords: "",
    match_mode: "contains" as "exact" | "contains" | "starts_with",
    active: true, user_id: "",
  });

  function openNew() {
    setEditing(null);
    setForm({ flow_id: "", instance_id: "", keywords: "", match_mode: "contains", active: true, user_id: "" });
    setOpen(true);
  }
  function openEdit(t: Trigger) {
    setEditing(t);
    setForm({
      flow_id: t.flow_id,
      instance_id: t.instance_id ?? "",
      keywords: t.keywords.join(", "),
      match_mode: t.match_mode,
      active: t.active,
      user_id: t.user_id,
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const kws = form.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
      if (!form.flow_id) throw new Error("Selecione um fluxo");
      if (!kws.length) throw new Error("Adicione pelo menos uma palavra-chave");
      return saveFn({
        data: {
          id: editing?.id,
          flow_id: form.flow_id,
          instance_id: form.instance_id || null,
          keywords: kws,
          match_mode: form.match_mode,
          active: form.active,
          user_id: opts?.isAdmin && form.user_id ? form.user_id : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Atualizado" : "Criado");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["kw-triggers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kw-triggers"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["kw-triggers"] });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="h-6 w-6" /> Palavras-chave
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dispare fluxos automaticamente quando o contato enviar uma mensagem com a palavra-chave configurada.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova palavra-chave</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid gap-3">
        {(list?.items ?? []).map((t: Trigger) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{t.flow_name}</span>
                  <Badge variant="outline">{matchLabel[t.match_mode]}</Badge>
                  {t.instance ? (
                    <Badge variant="secondary">Chip: {t.instance.instance_name}</Badge>
                  ) : (
                    <Badge variant="secondary">Qualquer chip</Badge>
                  )}
                  {t.created_by_admin && <Badge>admin</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.keywords.map((k) => (
                    <Badge key={k} variant="outline" className="font-mono text-xs">{k}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={t.active}
                  onCheckedChange={(v) => toggleMut.mutate({ id: t.id, active: v })}
                />
                <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => { if (confirm("Remover?")) delMut.mutate(t.id); }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !(list?.items ?? []).length && (
          <Card>
            <CardHeader>
              <CardTitle>Nenhuma palavra-chave</CardTitle>
              <CardDescription>
                Crie uma para que mensagens recebidas iniciem um fluxo automaticamente.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar palavra-chave" : "Nova palavra-chave"}</DialogTitle>
            <DialogDescription>
              Quando o contato enviar uma mensagem que combine, o fluxo é disparado para ele.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {opts?.isAdmin && (
              <div>
                <Label>Usuário (opcional)</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v, flow_id: "", instance_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="— meu próprio usuário —" /></SelectTrigger>
                  <SelectContent>
                    {(opts.users ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Fluxo</Label>
              <Select value={form.flow_id} onValueChange={(v) => setForm({ ...form, flow_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o fluxo" /></SelectTrigger>
                <SelectContent>
                  {(opts?.flows ?? [])
                    .filter((f: any) => !form.user_id || f.user_id === form.user_id)
                    .map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Chip (opcional)</Label>
              <Select value={form.instance_id || "any"} onValueChange={(v) => setForm({ ...form, instance_id: v === "any" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer chip do usuário</SelectItem>
                  {(opts?.instances ?? [])
                    .filter((i: any) => !form.user_id || i.user_id === form.user_id)
                    .map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.instance_name} {i.status === "connected" ? "🟢" : "⚪"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Palavras-chave (separe por vírgula)</Label>
              <Input
                placeholder="quero saber mais, info, comprar"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </div>

            <div>
              <Label>Modo de comparação</Label>
              <Select value={form.match_mode} onValueChange={(v) => setForm({ ...form, match_mode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="exact">Exato</SelectItem>
                  <SelectItem value="starts_with">Começa com</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active">Ativo</Label>
              <Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
