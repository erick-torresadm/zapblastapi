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
import { Plus, Trash2, Bot, Pencil, Clock, User, PlayCircle, RefreshCw, Square, StopCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listKeywordTriggersFn, upsertKeywordTriggerFn, toggleKeywordTriggerFn,
  deleteKeywordTriggerFn, listFlowsForKeywordsFn, listRecentFlowRunsFn, testKeywordTriggerFn,
  cancelFlowRunFn, cancelAllFlowRunsFn,
} from "@/lib/keywords.functions";

export const Route = createFileRoute("/_authenticated/app/keywords")({
  component: KeywordsPage,
});

type Trigger = {
  id: string; user_id: string; flow_id: string; instance_id: string | null;
  keywords: string[]; match_mode: "exact" | "contains" | "starts_with"; active: boolean;
  created_by_admin: boolean; flow_name: string;
  allow_from_me: boolean; delay_seconds: number; cooldown_seconds: number;
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
  const recentFn = useServerFn(listRecentFlowRunsFn);
  const testFn = useServerFn(testKeywordTriggerFn);
  const cancelRunFn = useServerFn(cancelFlowRunFn);
  const cancelAllFn = useServerFn(cancelAllFlowRunsFn);

  const { data: list, isLoading } = useQuery({ queryKey: ["kw-triggers"], queryFn: () => listFn() });
  const { data: opts } = useQuery({ queryKey: ["kw-opts"], queryFn: () => optsFn() });
  const { data: recent, refetch: refetchRecent } = useQuery({
    queryKey: ["kw-recent"], queryFn: () => recentFn(), refetchInterval: 5000,
  });

  const [testOpenFor, setTestOpenFor] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const testMut = useMutation({
    mutationFn: (v: { trigger_id: string; phone: string }) => testFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Gatilho disparado: ${r.matched} match, ${r.runs.length} run(s)`);
      setTestOpenFor(null);
      qc.invalidateQueries({ queryKey: ["kw-recent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [form, setForm] = useState({
    flow_id: "", instance_id: "", keywords: "",
    match_mode: "contains" as "exact" | "contains" | "starts_with",
    active: true, user_id: "",
    allow_from_me: false, delay_seconds: 0, cooldown_seconds: 0,
  });

  function openNew() {
    setEditing(null);
    setForm({
      flow_id: "", instance_id: "", keywords: "", match_mode: "contains",
      active: true, user_id: "",
      allow_from_me: false, delay_seconds: 0, cooldown_seconds: 0,
    });
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
      allow_from_me: !!t.allow_from_me,
      delay_seconds: t.delay_seconds ?? 0,
      cooldown_seconds: t.cooldown_seconds ?? 0,
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
          allow_from_me: form.allow_from_me,
          delay_seconds: form.delay_seconds,
          cooldown_seconds: form.cooldown_seconds,
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

  const cancelRunMut = useMutation({
    mutationFn: (id: string) => cancelRunFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Execução cancelada");
      qc.invalidateQueries({ queryKey: ["kw-recent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelAllMut = useMutation({
    mutationFn: () => cancelAllFn(),
    onSuccess: (r: { canceled: number }) => {
      toast.success(`${r.canceled} execução(ões) cancelada(s)`);
      qc.invalidateQueries({ queryKey: ["kw-recent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6" /> Bot — Palavras-chave
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O servidor escuta cada mensagem (recebida ou enviada pelo seu chip). Quando bater com uma palavra-chave, o fluxo dispara automaticamente.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo gatilho</Button>
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
                  {t.allow_from_me && (
                    <Badge variant="outline" className="gap-1"><User className="h-3 w-3" /> Eu também disparo</Badge>
                  )}
                  {t.delay_seconds > 0 && (
                    <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Atraso {t.delay_seconds}s</Badge>
                  )}
                  {t.cooldown_seconds > 0 && (
                    <Badge variant="outline" className="gap-1">Cooldown {t.cooldown_seconds}s</Badge>
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
                <Button size="icon" variant="ghost" title="Testar" onClick={() => { setTestOpenFor(t.id); setTestPhone(""); }}>
                  <PlayCircle className="h-4 w-4" />
                </Button>
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

      {/* Fila de disparos recentes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Fila de disparos
              <Badge variant="secondary">{recent?.todayCount ?? 0} hoje</Badge>
            </CardTitle>
            <CardDescription>Últimos fluxos disparados — atualiza a cada 5s.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm("Cancelar TODAS as execuções em andamento?")) cancelAllMut.mutate();
              }}
              disabled={cancelAllMut.isPending}
            >
              <StopCircle className="h-4 w-4 mr-2" /> Parar todos
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetchRecent()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(recent?.items ?? []).length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum disparo ainda.</div>
            )}
            {(recent?.items ?? []).map((r) => {
              const isActive = r.status === "pending" || r.status === "waiting" || r.status === "running";
              return (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.flow_name}</span>
                    <span className="text-muted-foreground">→ {r.contact_phone}</span>
                    {r.keyword && <Badge variant="outline" className="font-mono text-xs">{r.keyword}</Badge>}
                    <Badge variant="outline" className="text-xs">{r.instance_name}</Badge>
                  </div>
                  {r.error && <div className="text-xs text-destructive mt-1 truncate">{r.error}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={
                        r.status === "completed" ? "secondary"
                        : r.status === "failed" ? "destructive"
                        : r.status === "canceled" ? "outline"
                        : "outline"
                      }
                      className="text-xs capitalize"
                    >
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"}
                    </span>
                  </div>
                  {isActive && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Parar esta execução"
                      onClick={() => cancelRunMut.mutate(r.id)}
                      disabled={cancelRunMut.isPending}
                    >
                      <Square className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );})}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de teste manual */}
      <Dialog open={!!testOpenFor} onOpenChange={(o) => !o && setTestOpenFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Testar gatilho</DialogTitle>
            <DialogDescription>
              Vamos simular uma mensagem com a primeira palavra-chave deste gatilho e disparar o fluxo no número informado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Telefone (somente números, com DDD/país)</Label>
            <Input
              placeholder="5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpenFor(null)}>Cancelar</Button>
            <Button
              disabled={!testPhone || testMut.isPending}
              onClick={() => testOpenFor && testMut.mutate({ trigger_id: testOpenFor, phone: testPhone })}
            >
              {testMut.isPending ? "Disparando…" : "Disparar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar gatilho do Bot" : "Novo gatilho do Bot"}</DialogTitle>
            <DialogDescription>
              Quando a mensagem combinar com uma das palavras, o fluxo escolhido será disparado.
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

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="afm" className="text-sm">Eu também disparo (fromMe)</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ligado, mensagens enviadas pelo seu chip também acionam o fluxo (útil para o admin "comandar" o bot).
                  </p>
                </div>
                <Switch id="afm" checked={form.allow_from_me} onCheckedChange={(v) => setForm({ ...form, allow_from_me: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="delay" className="text-sm">Atraso (segundos)</Label>
                  <Input id="delay" type="number" min={0} max={86400}
                    value={form.delay_seconds}
                    onChange={(e) => setForm({ ...form, delay_seconds: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Espera antes de iniciar o fluxo.</p>
                </div>
                <div>
                  <Label htmlFor="cool" className="text-sm">Cooldown (segundos)</Label>
                  <Input id="cool" type="number" min={0} max={86400}
                    value={form.cooldown_seconds}
                    onChange={(e) => setForm({ ...form, cooldown_seconds: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Tempo mínimo entre disparos do mesmo gatilho.</p>
                </div>
              </div>
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
