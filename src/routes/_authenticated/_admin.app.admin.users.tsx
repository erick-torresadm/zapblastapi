import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Search, Crown } from "lucide-react";
import { adminSearchUsersFn, adminListUserSubscriptionFn, grantManualPlanFn } from "@/lib/admin-plans.functions";
import { adminListPlansFn } from "@/lib/coupons.functions";

export const Route = createFileRoute("/_authenticated/_admin/app/admin/users")({
  component: UsersAdminPage,
});

function UsersAdminPage() {
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState<string>("");
  const search = useServerFn(adminSearchUsersFn);
  const usersQ = useQuery({
    queryKey: ["admin-search-users", searched],
    queryFn: () => search({ data: { q: searched } }),
    enabled: searched.length >= 2,
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Crown className="h-6 w-6" /> Usuários & Planos
        </h1>
        <p className="text-muted-foreground">Pesquise usuários e atribua planos manualmente (pagamento recebido fora).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar usuário</CardTitle>
          <CardDescription>Digite o nome (mínimo 2 caracteres)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do usuário" onKeyDown={(e) => e.key === "Enter" && setSearched(q.trim())} />
            <Button onClick={() => setSearched(q.trim())}><Search className="h-4 w-4 mr-2" /> Buscar</Button>
          </div>

          <div className="space-y-2">
            {(usersQ.data ?? []).map((u: any) => (
              <UserCard key={u.id} user={u} />
            ))}
            {searched && !usersQ.isLoading && !usersQ.data?.length && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário encontrado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserCard({ user }: { user: any }) {
  const getSub = useServerFn(adminListUserSubscriptionFn);
  const subQ = useQuery({
    queryKey: ["admin-user-sub", user.id],
    queryFn: () => getSub({ data: { user_id: user.id } }),
  });

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <div className="font-medium">{user.full_name}</div>
        <div className="text-xs text-muted-foreground font-mono">{user.id}</div>
        {subQ.data && (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Badge variant={subQ.data.status === "active" ? "default" : "secondary"}>
              {subQ.data.plan?.name ?? "—"} · {subQ.data.status}
            </Badge>
            {subQ.data.current_period_end && (
              <span className="text-xs text-muted-foreground">
                até {new Date(subQ.data.current_period_end).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        )}
      </div>
      <GrantPlanDialog userId={user.id} userName={user.full_name} />
    </div>
  );
}

function GrantPlanDialog({ userId, userName }: { userId: string; userName: string }) {
  const listPlans = useServerFn(adminListPlansFn);
  const grant = useServerFn(grantManualPlanFn);
  const qc = useQueryClient();
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: () => listPlans() });

  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [duration, setDuration] = useState("30");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("pix_externo");
  const [note, setNote] = useState("");

  const submit = async () => {
    try {
      await grant({
        data: {
          target_user: userId,
          plan_id: planId,
          duration_days: Number(duration),
          amount_paid_cents: Math.round(Number(amount || "0") * 100),
          method,
          note,
        },
      });
      toast.success(`Plano ativado para ${userName}`);
      qc.invalidateQueries({ queryKey: ["admin-user-sub", userId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao ativar plano");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserPlus className="h-4 w-4 mr-2" /> Ativar plano</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ativar plano manualmente</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Usuário: <strong>{userName}</strong></p>
          <div>
            <Label>Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(plansQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — R$ {(p.price_cents / 100).toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duração (dias)</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">3 meses</SelectItem>
                  <SelectItem value="180">6 meses</SelectItem>
                  <SelectItem value="365">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor pago (R$)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div>
            <Label>Método de pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix_externo">PIX externo</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="cortesia">Cortesia / Brinde</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: pago via PIX dia 19/06" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!planId}>Ativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
