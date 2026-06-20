import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw, QrCode, Shield } from "lucide-react";
import { toast } from "sonner";
import { createInstanceFn, getInstanceQrFn, deleteInstanceFn, listAvailableServersFn, listInstancesFn } from "@/lib/instances.functions";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { Link } from "@tanstack/react-router";
import { formatPhone } from "@/lib/format-instance";

export const Route = createFileRoute("/_authenticated/app/instances")({ component: InstancesPage });

const statusVariant: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectado", cls: "bg-success text-success-foreground" },
  connecting: { label: "Conectando", cls: "bg-warning text-warning-foreground" },
  disconnected: { label: "Desconectado", cls: "bg-muted text-muted-foreground" },
  banned: { label: "Banido", cls: "bg-destructive text-destructive-foreground" },
  error: { label: "Erro", cls: "bg-destructive text-destructive-foreground" },
};

function InstancesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<{ qrcode: string | null; state: string | null; instanceId: string; error?: string | null; tries?: number } | null>(null);

  const createFn = useServerFn(createInstanceFn);
  const qrFn = useServerFn(getInstanceQrFn);
  const delFn = useServerFn(deleteInstanceFn);
  const listServersFn = useServerFn(listAvailableServersFn);
  const listInsts = useServerFn(listInstancesFn);

  const { data: servers } = useQuery({
    queryKey: ["available-servers"],
    queryFn: () => listServersFn(),
  });

  const { data: instances } = useQuery({
    queryKey: ["instances"],
    queryFn: () => listInsts(),
  });


  const create = useMutation({
    mutationFn: async (input: { server_id: string; instance_name: string; daily_limit: number }) =>
      createFn({ data: input }),
    onSuccess: (res) => {
      toast.success("Chip criado — escaneie o QR code");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["instances"] });
      setQrData({ qrcode: res.qrcode, state: "connecting", instanceId: res.instance.id, error: null, tries: 0 });
      setQrOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshQr = useMutation({
    mutationFn: async (args: { instance_id: string; force_restart?: boolean }) =>
      qrFn({ data: args }),
    onSuccess: (res, args) => {
      setQrData((prev) => ({
        qrcode: res.qrcode,
        state: res.state,
        instanceId: args.instance_id,
        error: res.error ?? null,
        tries: (prev?.tries ?? 0) + 1,
      }));
      qc.invalidateQueries({ queryKey: ["instances"] });
      if (res.state === "open") toast.success("Conectado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (instance_id: string) => delFn({ data: { instance_id } }),
    onSuccess: () => { toast.success("Chip removido"); qc.invalidateQueries({ queryKey: ["instances"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-poll QR a cada 3s enquanto dialog aberto e não conectado
  useEffect(() => {
    if (!qrOpen || !qrData?.instanceId || qrData.state === "open") return;
    const t = setInterval(() => refreshQr.mutate({ instance_id: qrData.instanceId }), 3000);
    return () => clearInterval(t);
  }, [qrOpen, qrData?.instanceId, qrData?.state]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chips conectados</h1>
          <p className="text-sm text-muted-foreground">Cada chip é uma conexão de WhatsApp rodando na nossa infraestrutura</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <NewChipTrigger serversAvailable={!!servers?.length} />

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar chip</DialogTitle>
              <DialogDescription>Vai criar uma nova instância no servidor e mostrar o QR code.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                create.mutate({
                  server_id: String(fd.get("server_id")),
                  instance_name: String(fd.get("instance_name")),
                  daily_limit: Number(fd.get("daily_limit") ?? 200),
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label>Servidor</Label>
                <Select name="server_id" required>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {servers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.is_shared ? "Infraestrutura Perseidas (recomendado)" : s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="instance_name">Nome do chip</Label><Input id="instance_name" name="instance_name" required placeholder="chip-01" pattern="[a-zA-Z0-9_-]+" /></div>
              <div><Label htmlFor="daily_limit">Limite diário</Label><Input id="daily_limit" name="daily_limit" type="number" defaultValue={200} min={1} max={2000} /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>Criar e gerar QR</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!servers?.length && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">
          A infraestrutura está sendo preparada. Tente novamente em alguns instantes ou fale com o suporte.
        </CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Seus chips</CardTitle></CardHeader>
        <CardContent>
          {!instances?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum chip cadastrado.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Servidor</TableHead><TableHead>Status</TableHead><TableHead>Enviadas hoje</TableHead><TableHead>Limite</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {instances.map((i) => {
                  const s = statusVariant[i.status] ?? statusVariant.disconnected;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.instance_name}<div className="text-xs text-muted-foreground">{formatPhone(i.phone_number)}</div></TableCell>
                      <TableCell className="flex items-center gap-2">{i.server_is_shared ? <Badge variant="outline" className="gap-1 text-[10px]"><Shield className="h-3 w-3" />Perseidas</Badge> : <span>{i.server_name}</span>}</TableCell>
                      <TableCell><Badge className={s.cls}>{s.label}</Badge></TableCell>
                      <TableCell>{i.sent_today}</TableCell>
                      <TableCell>{i.daily_limit}</TableCell>
                      <TableCell className="space-x-1">
                        <Button variant="ghost" size="icon" title="Ver QR" onClick={() => { setQrData({ qrcode: null, state: i.status, instanceId: i.id, error: null, tries: 0 }); setQrOpen(true); refreshQr.mutate({ instance_id: i.id }); }}>
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Remover" onClick={() => { if (confirm("Remover este chip?")) remove.mutate(i.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escaneie o QR code</DialogTitle>
            <DialogDescription>WhatsApp → Aparelhos conectados → Conectar um aparelho</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrData?.qrcode ? (
              <img src={qrData.qrcode} alt="QR code" className="h-64 w-64" />
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded border bg-muted px-4 text-center text-sm text-muted-foreground">
                {qrData?.state === "open" ? (
                  <span>Conectado ✓</span>
                ) : qrData?.error ? (
                  <>
                    <span className="font-medium text-destructive">Não consegui gerar o QR</span>
                    <span className="text-xs">{qrData.error}</span>
                  </>
                ) : (qrData?.tries ?? 0) >= 4 ? (
                  <span>A conexão ainda não devolveu o QR. Tente novamente em alguns segundos.</span>
                ) : (
                  <span>Gerando QR…</span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => qrData && refreshQr.mutate({ instance_id: qrData.instanceId })} disabled={refreshQr.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />Atualizar
              </Button>
              <Button variant="secondary" onClick={() => qrData && refreshQr.mutate({ instance_id: qrData.instanceId, force_restart: true })} disabled={refreshQr.isPending}>
                Resetar conexão
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewChipTrigger({ serversAvailable }: { serversAvailable: boolean }) {
  const limits = usePlanLimits();
  const blocked = !limits.canConnectChip;
  const reason = !limits.canAct
    ? "Teste grátis expirado. Assine pra conectar novos chips."
    : limits.data?.limits && limits.data?.usage && limits.data.limits.max_chips !== -1 && limits.data.usage.chips >= limits.data.limits.max_chips
      ? `Limite do plano ${limits.plan}: ${limits.data.limits.max_chips} chip${limits.data.limits.max_chips > 1 ? "s" : ""}. Faça upgrade.`
      : !serversAvailable ? "Sem servidores disponíveis" : "";

  if (blocked || !serversAvailable) {
    return (
      <Button asChild variant="outline" title={reason}>
        <Link to="/app/billing">
          <Plus className="mr-2 h-4 w-4" />
          {blocked ? "Limite atingido — fazer upgrade" : "Novo chip"}
        </Link>
      </Button>
    );
  }
  return (
    <DialogTrigger asChild>
      <Button><Plus className="mr-2 h-4 w-4" />Novo chip</Button>
    </DialogTrigger>
  );
}

