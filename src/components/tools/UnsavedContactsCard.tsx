import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Download, Loader2, AlertTriangle, Lock, Crown, FileDown, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { listUnsavedContactsFn, exportUnsavedAsVcardFn } from "@/lib/unsaved-contacts.functions";
import { formatPhone } from "@/lib/format-instance";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, mime = "text/vcard;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function UnsavedContactsCard({ instances }: { instances: any[] }) {
  const list = useServerFn(listUnsavedContactsFn);
  const exportVcard = useServerFn(exportUnsavedAsVcardFn);
  const [instanceId, setInstanceId] = useState("");
  const [result, setResult] = useState<any | null>(null);

  const scan = useMutation({
    mutationFn: () => list({ data: { instance_id: instanceId } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.total} contatos não salvos encontrados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vcf = useMutation({
    mutationFn: () => exportVcard({ data: { instance_id: instanceId } }),
    onSuccess: (r) => {
      downloadText(`contatos-nao-salvos-${Date.now()}.vcf`, r.vcard);
      toast.success(`${r.count} contatos prontos pra importar no seu celular`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    if (!result?.contacts) return;
    const rows: string[][] = [["telefone", "nome_whatsapp", "ultima_mensagem", "preview"]];
    for (const c of result.contacts) {
      rows.push([
        c.phone ?? "",
        c.push_name ?? "",
        fmtDate(c.last_message_at),
        c.last_message_text ?? "",
      ]);
    }
    downloadCsv(`nao-salvos-${Date.now()}.csv`, rows);
  }

  const canExport = result?.can_export;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Contatos não salvos
            </CardTitle>
            <CardDescription>
              Quantos clientes te mandaram mensagem mas nunca foram salvos na sua agenda? A gente descobre — e você importa todos de uma vez.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1 bg-primary/10 text-primary">
            <Crown className="h-3 w-3" /> Plano Pago
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr,auto]">
          <div className="space-y-1.5">
            <Label>Chip pra analisar</Label>
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
          <div className="flex items-end">
            <Button
              onClick={() => scan.mutate()}
              disabled={!instanceId || scan.isPending}
              className="w-full md:w-auto"
            >
              {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              Analisar agenda
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-3">
            {/* Hero stat */}
            <div className={`rounded-xl border p-5 text-center ${result.total > 50 ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
              <div className="text-5xl font-extrabold tracking-tight">{result.total}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                contatos não salvos
                {result.with_conversation > 0 && ` • ${result.with_conversation} já te mandaram mensagem`}
              </div>
              {result.total > 30 && canExport && (
                <p className="mt-2 text-xs text-destructive">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  Cada conversa aí pode virar venda — não deixa esfriar.
                </p>
              )}
            </div>

            {/* Upgrade gate */}
            {!canExport && result.total > 0 && (
              <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-5">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="font-semibold">Exportação liberada no plano pago</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Você está vendo só uma prévia. No plano <strong>Pro</strong> você baixa a lista completa em CSV, gera o arquivo .vcf pra importar direto no celular, e nunca mais perde uma conversa de um cliente sem nome.
                    </p>
                    <Link to="/app/billing" className="mt-3 inline-block">
                      <Button size="sm" className="gap-1">
                        <Crown className="h-4 w-4" /> Fazer upgrade agora
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Export actions */}
            {canExport && result.total > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={exportCsv} variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Baixar CSV
                </Button>
                <Button
                  onClick={() => vcf.mutate()}
                  disabled={vcf.isPending}
                  size="sm"
                >
                  {vcf.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  Gerar .vcf (importar no celular)
                </Button>
              </div>
            )}

            {/* Preview table */}
            {result.contacts?.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Nome no WhatsApp</th>
                      <th className="px-3 py-2">Última msg</th>
                      <th className="px-3 py-2">Prévia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.contacts.map((c: any, i: number) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-2 font-mono">{c.phone ?? "—"}</td>
                        <td className="px-3 py-2">{c.push_name ?? <span className="text-muted-foreground italic">(sem nome)</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.last_message_at)}</td>
                        <td className="px-3 py-2 truncate text-muted-foreground" style={{ maxWidth: 200 }}>
                          {c.last_message_text ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!canExport && result.total > result.contacts.length && (
                  <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                    🔒 +{result.total - result.contacts.length} contatos ocultos — desbloqueie no Pro
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
