import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, ShieldCheck, Download, Wallet, Sparkles, Loader2, MapPin, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { validateNumbersFn, getToolsPricingFn } from "@/lib/tools.functions";
import { listInstancesFn } from "@/lib/instances.functions";
import { getWalletFn } from "@/lib/wallet.functions";
import { MapsExtractorCard } from "@/components/tools/MapsExtractorCard";
import { UnsavedContactsCard } from "@/components/tools/UnsavedContactsCard";
import { formatPhone } from "@/lib/format-instance";

export const Route = createFileRoute("/_authenticated/app/tools")({ component: ToolsPage });

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ToolsPage() {
  const listInsts = useServerFn(listInstancesFn);
  const getPricing = useServerFn(getToolsPricingFn);
  const getWallet = useServerFn(getWalletFn);

  const { data: instances } = useQuery({ queryKey: ["instances"], queryFn: () => listInsts() });
  const { data: pricing } = useQuery({ queryKey: ["tools-pricing"], queryFn: () => getPricing() });
  const { data: walletData, refetch: refetchWallet } = useQuery({ queryKey: ["wallet"], queryFn: () => getWallet() });

  const connectedInstances = useMemo(
    () => (instances ?? []).filter((i: any) => i.status === "connected" || i.status === "open"),
    [instances],
  );

  const balance = Number(walletData?.wallet?.balance_cents ?? 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" />
            Ferramentas
          </h1>
          <p className="text-sm text-muted-foreground">
            Recursos pay-per-use para turbinar suas campanhas. Cobrado direto do seu saldo.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <Wallet className="h-4 w-4 text-primary" />
          <div className="text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</div>
            <div className="font-semibold">{brl(balance)}</div>
          </div>
          <Link to="/app/wallet">
            <Button size="sm" variant="outline" className="h-8">Adicionar saldo</Button>
          </Link>
        </div>
      </div>

      {connectedInstances.length === 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="text-sm">
              <div className="font-medium">Você precisa de pelo menos 1 chip conectado</div>
              <div className="text-muted-foreground">As ferramentas usam um dos seus chips para consultar o WhatsApp.</div>
            </div>
            <Link to="/app/instances"><Button size="sm">Conectar chip</Button></Link>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="maps" className="space-y-4">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="maps">
            <MapPin className="mr-2 h-4 w-4" /> Google Maps
          </TabsTrigger>
          <TabsTrigger value="unsaved">
            <UserPlus className="mr-2 h-4 w-4" /> Não salvos
          </TabsTrigger>
          <TabsTrigger value="validator">
            <ShieldCheck className="mr-2 h-4 w-4" /> Validador
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maps">
          <MapsExtractorCard
            flatPrice={pricing?.maps_search_flat_cents ?? 500}
            waCheckPrice={pricing?.maps_whatsapp_check_per_lead_cents ?? 2}
            maxLeads={pricing?.maps_search_max_leads ?? 60}
            balance={balance}
            instances={connectedInstances}
            onSuccess={() => refetchWallet()}
          />
        </TabsContent>

        <TabsContent value="unsaved">
          <UnsavedContactsCard instances={connectedInstances} />
        </TabsContent>

        <TabsContent value="validator">
          <ValidatorCard
            instances={connectedInstances}
            pricePerNumber={pricing?.validator_per_number_cents ?? 2}
            balance={balance}
            onSuccess={() => refetchWallet()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================

function ValidatorCard({
  instances,
  pricePerNumber,
  balance,
  onSuccess,
}: {
  instances: any[];
  pricePerNumber: number;
  balance: number;
  onSuccess: () => void;
}) {
  const validate = useServerFn(validateNumbersFn);
  const [instanceId, setInstanceId] = useState<string>("");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<any | null>(null);

  const numbers = useMemo(() => {
    const set = new Set<string>();
    for (const line of raw.split(/[\s,;\n\r\t]+/)) {
      const d = line.replace(/\D/g, "");
      if (d.length >= 8 && d.length <= 15) set.add(d);
    }
    return Array.from(set);
  }, [raw]);

  const estCost = numbers.length * pricePerNumber;
  const insufficient = estCost > balance;

  const mut = useMutation({
    mutationFn: () => validate({ data: { instance_id: instanceId, numbers } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.valid_count} válidos, ${r.invalid_count} inválidos — debitado ${brl(r.cost_cents)}`);
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    if (!result) return;
    const rows: string[][] = [["numero", "jid", "valido"]];
    for (const v of result.valid) rows.push([v.number, v.jid, "sim"]);
    for (const n of result.invalid) rows.push([n, "", "nao"]);
    downloadCsv(`validacao-${Date.now()}.csv`, rows);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Validador de números WhatsApp
            </CardTitle>
            <CardDescription>
              Cole sua lista, descubra quem realmente tem WhatsApp. Limpa seu mailing antes de disparar e evita ban dos chips.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">{brl(pricePerNumber)} / número</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Chip que vai validar</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger><SelectValue placeholder="Escolha um chip conectado" /></SelectTrigger>
              <SelectContent>
                {instances.map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{i.instance_name}</span>
                      <span className="text-muted-foreground text-xs">{formatPhone(i.phone_number)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Números (um por linha, vírgula ou espaço)</Label>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="5511999999999&#10;11988887777&#10;+55 21 97777-6666"
            className="min-h-[180px] font-mono text-xs"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{numbers.length} número(s) únicos detectados</span>
            <span className={insufficient ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
              Custo estimado: {brl(estCost)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => mut.mutate()}
            disabled={!instanceId || numbers.length === 0 || insufficient || mut.isPending}
          >
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Validar {numbers.length || ""} número(s)
          </Button>
          {insufficient && (
            <Link to="/app/wallet"><Button variant="outline">Adicionar saldo</Button></Link>
          )}
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-success">{result.valid_count}</div>
                <div className="text-[11px] uppercase text-muted-foreground">Válidos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">{result.invalid_count}</div>
                <div className="text-[11px] uppercase text-muted-foreground">Sem WhatsApp</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{brl(result.cost_cents)}</div>
                <div className="text-[11px] uppercase text-muted-foreground">Debitado</div>
              </div>
            </div>
            <Button onClick={exportCsv} variant="outline" size="sm" className="w-full">
              <Download className="mr-2 h-4 w-4" /> Baixar CSV completo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

