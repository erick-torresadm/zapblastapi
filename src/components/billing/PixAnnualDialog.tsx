import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Copy, Check, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planName: string;
  annualCents: number;
};

type PixData = { txid: string; qrcode: string; imagem_qrcode: string; valor: string; expires_in: number };

async function functionErrorMessage(error: unknown) {
  const context = (error as { context?: Response })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      return body?.details?.mensagem ?? body?.details?.error_description ?? body?.details ?? body?.error;
    } catch {
      return await context.clone().text();
    }
  }
  return (error as Error)?.message;
}

export function PixAnnualDialog({ open, onOpenChange, planId, planName, annualCents }: Props) {
  const [pix, setPix] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("efi-pix-annual", { body: { plan_id: planId } });
      if (error) throw new Error((await functionErrorMessage(error)) ?? "Falha ao gerar PIX");
      if (data?.error) throw new Error(data.details ?? data.error);
      return data as PixData;
    },
    onSuccess: (d) => setPix(d),
    onError: (e: Error) => toast.error(e.message),
  });

  const annualFmt = (annualCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCopy = async () => {
    if (!pix) return;
    await navigator.clipboard.writeText(pix.qrcode);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPix(null); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" /> {planName} Anual via PIX
          </DialogTitle>
          <DialogDescription>
            {annualFmt} à vista · 30% off · 12 meses de acesso
          </DialogDescription>
        </DialogHeader>

        {!pix ? (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Gere um QR Code PIX e pague com qualquer banco. Após a confirmação, seu plano anual será ativado automaticamente.
            </p>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
              {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</> : `Gerar PIX de ${annualFmt}`}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="bg-white p-3 rounded-lg border">
              <img src={pix.imagem_qrcode} alt="QR Code PIX" className="w-56 h-56" />
            </div>
            <div className="w-full">
              <div className="text-xs text-muted-foreground mb-1">PIX Copia e Cola</div>
              <div className="flex gap-2">
                <input readOnly value={pix.qrcode} className="flex-1 text-xs font-mono bg-muted/40 rounded px-2 py-2 truncate" />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Expira em 1 hora. O plano é ativado automaticamente após a confirmação do pagamento.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
