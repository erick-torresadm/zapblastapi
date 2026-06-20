import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Trash2, Link2, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { listAgentsFn, addAgentFn, updateAgentFn, removeAgentFn } from "@/lib/crm.functions";
import { listInviteLinksFn, createInviteLinkFn, revokeInviteLinkFn } from "@/lib/invites.functions";

export const Route = createFileRoute("/_authenticated/app/team")({ component: TeamPage });

type Agent = { id: string; agent_user_id: string; role: "owner" | "admin" | "agent"; display_name: string | null; active: boolean; created_at: string };

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgentsFn);
  const addFn = useServerFn(addAgentFn);
  const updFn = useServerFn(updateAgentFn);
  const delFn = useServerFn(removeAgentFn);

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["team-agents"],
    queryFn: () => listFn() as unknown as Promise<Agent[]>,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [name, setName] = useState("");

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { email: email.trim(), role, display_name: name.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Atendente adicionado");
      setEmail(""); setName(""); setRole("agent");
      qc.invalidateQueries({ queryKey: ["team-agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: (v: { id: string; active?: boolean; role?: "admin" | "agent"; display_name?: string }) =>
      updFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-agents"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["team-agents"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const members = agents.filter((a) => a.role !== "owner");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" /> Equipe
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Convide atendentes para responder no CRM. Eles só veem as conversas atribuídas a eles e as que estão na fila.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar atendente</CardTitle>
          <CardDescription>
            O e-mail precisa pertencer a uma conta já cadastrada. Peça para a pessoa criar uma conta antes (gratuita) e depois adicione aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); if (email) addMut.mutate(); }}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]"
          >
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="atendente@exemplo.com" />
            </div>
            <div>
              <Label className="text-xs">Nome de exibição (opcional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva" />
            </div>
            <div>
              <Label className="text-xs">Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "agent")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Atendente</SelectItem>
                  <SelectItem value="admin">Admin (pode transferir)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={addMut.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Atendentes ({members.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && members.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum atendente além de você.</p>
          )}
          {members.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded border p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                  {(a.display_name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.display_name ?? a.agent_user_id.slice(0,8)}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{a.agent_user_id}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select value={a.role} onValueChange={(v) => updMut.mutate({ id: a.id, role: v as "admin" | "agent" })}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Atendente</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Switch checked={a.active} onCheckedChange={(v) => updMut.mutate({ id: a.id, active: v })} />
                  <Badge variant={a.active ? "default" : "secondary"} className="text-[10px]">
                    {a.active ? "ativo" : "inativo"}
                  </Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover atendente?")) delMut.mutate(a.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
