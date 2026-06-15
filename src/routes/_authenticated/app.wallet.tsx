import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet as WalletIcon, Plus, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getWalletFn, mockTopupFn } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_authenticated/app/wallet")({ component: WalletPage });

const TOPUP_VALUES = [5000, 10000, 25000, 50000]; // R$ 50, 100, 250, 500

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function WalletPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(10000);
  const walletFn = useServerFn(getWalletFn);
  const topupFn = useServerFn(mockTopupFn);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => walletFn(),
    refetchInterval: 15000,
  });

  const topup = useMutation({
    mutationFn: async (cents: number) => topupFn({ data: { amount_cents: cents } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      toast.success("Saldo adicionado (modo DEV)");
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><WalletIcon className="h-6 w-6" /> Carteira</h1>
          <p className="text-muted-foreground">Recarregue saldo pra comprar chips no marketplace.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Adicionar saldo</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Saldo disponível</CardDescription>
            <CardTitle className="text-4xl text-primary">{isLoading ? "—" : brl(data?.wallet.balance_cents ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total recarregado</CardDescription>
            <CardTitle className="text-4xl">{brl(data?.wallet.total_topped_up_cents ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.transactions ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                  <TableCell className={`text-right font-mono ${t.amount_cents > 0 ? "text-success" : "text-destructive"}`}>
                    <span className="inline-flex items-center gap-1">
                      {t.amount_cents > 0 ? <ArrowUpCircle className="h-3 w-3" /> : <ArrowDownCircle className="h-3 w-3" />}
                      {t.amount_cents > 0 ? "+" : ""}{brl(t.amount_cents)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{brl(t.balance_after_cents)}</TableCell>
                </TableRow>
              ))}
              {(data?.transactions ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma movimentação ainda</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar saldo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">⚠️ Modo desenvolvimento: o saldo é creditado direto sem cobrança real. Stripe será conectado em breve.</p>
          <div className="grid grid-cols-2 gap-2">
            {TOPUP_VALUES.map((v) => (
              <Button key={v} variant={amount === v ? "default" : "outline"} onClick={() => setAmount(v)}>
                {brl(v)}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => topup.mutate(amount)} disabled={topup.isPending}>
              {topup.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar {brl(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
