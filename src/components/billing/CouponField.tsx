import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, Check, X, Gift } from "lucide-react";
import { toast } from "sonner";
import { validateCouponFn, applyFreeCouponFn } from "@/lib/coupons.functions";

export type CouponResult = {
  valid: boolean;
  message: string;
  coupon_id?: string;
  type?: "percent" | "fixed" | "free";
  value?: number;
  free_duration_days?: number | null;
  base_cents?: number;
  discount_cents?: number;
  final_cents?: number;
};

interface Props {
  planId: string;
  basePriceCents: number;
  onApplied?: (r: CouponResult & { code: string }) => void;
  /** Quando true, cupons tipo "free" ativam imediatamente o plano (sem checkout). */
  allowFreeActivation?: boolean;
  onFreeActivated?: (info: { subscription_id?: string; duration_days?: number }) => void;
}

export function CouponField({ planId, basePriceCents, onApplied, allowFreeActivation, onFreeActivated }: Props) {
  const validate = useServerFn(validateCouponFn);
  const applyFree = useServerFn(applyFreeCouponFn);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<(CouponResult & { code: string }) | null>(null);

  const validateCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await validate({ data: { code: code.trim(), plan_id: planId } });
      if (!r.valid) {
        toast.error(r.message || "Cupom inválido");
        setApplied(null);
        return;
      }
      const full = { ...r, code: code.trim().toUpperCase() };
      setApplied(full);
      onApplied?.(full);
      toast.success("Cupom aplicado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao validar");
    } finally {
      setBusy(false);
    }
  };

  const activateFree = async () => {
    if (!applied) return;
    setBusy(true);
    try {
      const r = await applyFree({ data: { code: applied.code, plan_id: planId } });
      if (!r.valid) {
        toast.error(r.message || "Não foi possível ativar");
        return;
      }
      toast.success(`Plano grátis ativado por ${r.duration_days} dias!`);
      onFreeActivated?.({ subscription_id: r.subscription_id, duration_days: r.duration_days });
    } catch (e: any) {
      toast.error(e.message || "Erro ao ativar");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => { setApplied(null); setCode(""); };

  if (applied) {
    const discount = applied.discount_cents ?? 0;
    const finalC = applied.final_cents ?? basePriceCents;
    return (
      <div className="rounded-lg border border-success bg-success/10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-success" />
            <span className="font-mono font-bold">{applied.code}</span>
            <Badge variant="secondary">
              {applied.type === "percent" ? `${applied.value}% off` :
                applied.type === "fixed" ? `R$ ${(Number(applied.value)/100).toFixed(2)} off` :
                "100% off"}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={remove}><X className="h-3 w-3" /></Button>
        </div>
        <div className="text-xs text-muted-foreground">
          De <span className="line-through">R$ {(basePriceCents/100).toFixed(2)}</span>{" "}
          por <strong className="text-foreground">R$ {(finalC/100).toFixed(2)}</strong>
          {discount > 0 && <> (economia R$ {(discount/100).toFixed(2)})</>}
        </div>
        {allowFreeActivation && applied.type === "free" && (
          <Button onClick={activateFree} disabled={busy} className="w-full" size="sm">
            <Gift className="h-4 w-4 mr-2" />
            Ativar plano grátis por {applied.free_duration_days ?? 30} dias
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CUPOM"
          className="pl-9 font-mono"
          onKeyDown={(e) => e.key === "Enter" && validateCode()}
        />
      </div>
      <Button variant="outline" onClick={validateCode} disabled={busy || !code.trim()}>
        Aplicar
      </Button>
    </div>
  );
}
