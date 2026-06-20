import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, AlertTriangle, CheckCircle2, CreditCard, QrCode } from "lucide-react";

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanName: string;
  newPlanName: string;
  cycle: "monthly" | "annual";
  changeType: "upgrade" | "downgrade";
  currentPriceCents: number;
  newPriceCents: number;
  diffCents: number;
  currentPeriodEnd?: string | null;
  onConfirm: () => void;
};

export function PlanChangeConfirmDialog({
  open, onOpenChange, currentPlanName, newPlanName, cycle, changeType,
  currentPriceCents, newPriceCents, diffCents, currentPeriodEnd, onConfirm,
}: Props) {
  const isUpgrade = changeType === "upgrade";
  const isAnnual = cycle === "annual";
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString("pt-BR") : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpgrade ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
            {isUpgrade ? "Confirmar upgrade de plano" : "Confirmar troca de plano"}
          </DialogTitle>
          <DialogDescription>
            Revise os detalhes antes de continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Visual: De → Para */}
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex-1 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Plano atual</div>
              <div className="font-semibold">{currentPlanName}</div>
              <div className="text-xs text-muted-foreground">{brl(currentPriceCents)}/mês</div>
            </div>
            <ArrowRight className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="flex-1 text-center">
              <div className="text-xs text-primary uppercase tracking-wider mb-1 font-medium">Novo plano</div>
              <div className="font-semibold text-primary">{newPlanName}</div>
              <div className="text-xs text-muted-foreground">{brl(newPriceCents)}/mês</div>
            </div>
          </div>

          {/* O que acontece */}
          <div className="space-y-2 text-sm">
            <div className="font-medium">O que acontece quando você confirmar:</div>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">1.</span>
                <span>Sua assinatura atual do <strong>{currentPlanName}</strong> é cancelada automaticamente.</span>
              </li>
              {isAnnual ? (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">2.</span>
                    {isUpgrade ? (
                      <span>
                        Você paga apenas a <strong className="text-primary">diferença de {brl(diffCents)}</strong> via PIX
                        — sem cobrar o valor cheio do novo plano e <strong>sem reembolso</strong> do plano antigo.
                      </span>
                    ) : (
                      <span>
                        Downgrade no anual <strong>não gera reembolso</strong>. A troca passa a valer apenas na próxima renovação anual{periodEnd && ` (em ${periodEnd})`}.
                      </span>
                    )}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">3.</span>
                    <span>Após o pagamento, seu plano é atualizado imediatamente para o <strong>{newPlanName}</strong>.</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">2.</span>
                    <span>
                      Você continua usando o <strong>{currentPlanName}</strong> até{" "}
                      <strong>{periodEnd ?? "o fim do período pago"}</strong> — sem reembolso, sem cobrança duplicada.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">3.</span>
                    <span>
                      Na próxima cobrança você passa a pagar <strong>{brl(newPriceCents)}/mês</strong> pelo {newPlanName}.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">4.</span>
                    <span>Por segurança, você vai informar os dados do cartão novamente.</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Badge resumo */}
          <div className="flex items-center justify-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
            {isAnnual ? <QrCode className="h-4 w-4 text-primary" /> : <CreditCard className="h-4 w-4 text-primary" />}
            <span className="text-sm">
              {isAnnual && isUpgrade ? (
                <>Você vai pagar <Badge className="ml-1">{brl(diffCents)}</Badge> agora via PIX</>
              ) : isAnnual ? (
                <>Troca agendada para a próxima renovação anual</>
              ) : (
                <>Próxima cobrança no cartão será de <Badge className="ml-1">{brl(newPriceCents)}</Badge></>
              )}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onOpenChange(false); onConfirm(); }}>
            {isAnnual && isUpgrade ? "Continuar para PIX" : isAnnual ? "Entendi" : "Continuar para cartão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
