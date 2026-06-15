import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Phone, Clock, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { buyChipFn } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/app/marketplace")({ component: MarketplacePage });

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function MarketplacePage() {
  const qc = useQueryClient();
  const buyFn = useServerFn(buyChipFn);

  const { data: catalog } = useQuery({
    queryKey: ["chip-catalog"],
    queryFn: async () => (await supabase.from("chip_catalog").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => (await supabase.from("wallets").select("balance_cents").maybeSingle()).data,
    refetchInterval: 10000,
  });
  const { data: purchases } = useQuery({
    queryKey: ["chip-purchases"],
    queryFn: async () => (await supabase.from("chip_purchases").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
    refetchInterval: 8000,
  });

  const buy = useMutation({
    mutationFn: async (id: string) => buyFn({ data: { catalog_item_id: id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["chip-catalog"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      qc.invalidateQueries({ queryKey: ["chip-purchases"] });
      toast.success(`Chip ${r.phone} provisionado!`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const balance = wallet?.balance_cents ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="h-6 w-6" /> Marketplace</h1>
          <p className="text-muted-foreground">Compre chips virtuais brasileiros direto pela plataforma.</p>
        </div>
        <Link to="/app/wallet"><Button variant="outline"><Wallet className="h-4 w-4 mr-2" /> Saldo: {brl(balance)}</Button></Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(catalog ?? []).map((item) => {
          const canBuy = balance >= item.price_cents;
          return (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle>{item.name}</CardTitle>
                  <Badge variant={item.provider === "mock" ? "secondary" : "default"}>{item.provider}</Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <div className="text-3xl font-bold text-primary">{brl(item.price_cents)}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Vida útil: {item.ttl_minutes >= 60 ? `${Math.round(item.ttl_minutes / 60)}h` : `${item.ttl_minutes}min`}</div>
                <div className="text-xs text-muted-foreground">País: 🇧🇷 BR · Serviço: WhatsApp</div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" disabled={!canBuy || buy.isPending} onClick={() => buy.mutate(item.id)}>
                  {buy.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
                  {canBuy ? "Comprar" : "Saldo insuficiente"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
        {(catalog ?? []).length === 0 && (
          <Card className="md:col-span-3"><CardContent className="pt-6 text-center text-muted-foreground">Nenhum produto disponível. Admins podem adicionar em <strong>Admin</strong>.</CardContent></Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Minhas compras</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(purchases ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma compra ainda.</p>}
          {(purchases ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b py-2 last:border-0">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-mono text-sm">{p.phone_number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR")}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono">{brl(p.price_paid_cents)}</span>
                <Badge variant={p.status === "active" ? "default" : p.status === "refunded" ? "destructive" : "secondary"}>{p.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
