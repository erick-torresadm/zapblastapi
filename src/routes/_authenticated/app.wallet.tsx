import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { getWalletFn } from "@/lib/wallet.functions";

export const Route = createFileRoute("/_authenticated/app/wallet")({ component: WalletPage });

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function WalletPage() {
  const walletFn = useServerFn(getWalletFn);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => walletFn(),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><WalletIcon className="h-6 w-6" /> Carteira</h1>
          <p className="text-muted-foreground">Recarregue saldo pra comprar chips no marketplace.</p>
        </div>
        <Button variant="outline" onClick={() => toast.info("Pagamentos em integração final. Em breve.")}>
          Adicionar saldo (em breve)
        </Button>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm">
            <strong>Recargas temporariamente indisponíveis.</strong> Estamos finalizando a integração de pagamentos (PIX e cartão via Efí Bank). Em breve você poderá adicionar saldo direto por aqui.
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
