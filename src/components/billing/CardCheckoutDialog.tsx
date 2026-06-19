import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { getEfiPublicConfigFn } from "@/lib/billing.functions";
import { supabase } from "@/integrations/supabase/client";

// Tipagem mínima do SDK Efí ($gn) injetado dinamicamente
type EfiCheckout = {
  getPaymentToken: (
    card: { brand: string; number: string; cvv: string; expiration_month: string; expiration_year: string },
    cb: (error: unknown, response: { data: { payment_token: string; card_mask: string } }) => void,
  ) => void;
};
declare global {
  interface Window {
    $gn?: { ready: (cb: (checkout: EfiCheckout) => void) => void };
  }
}

function detectBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^(36|38|30[0-5])/.test(n)) return "diners";
  if (/^6(011|5)/.test(n)) return "discover";
  if (/^(4011|4312|4389|4514|4573|5041|5066|5067|509|6277|6362|6363|6504|6505|6516|6550)/.test(n)) return "elo";
  if (/^606282/.test(n)) return "hipercard";
  return "visa";
}

function loadEfiScript(payeeCode: string, env: "prod" | "sandbox"): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(payeeCode)) {
      const wait = setInterval(() => {
        if (window.$gn) { clearInterval(wait); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(wait); reject(new Error("Timeout carregando SDK Efí")); }, 10000);
      return;
    }
    const v = Math.floor(Math.random() * 1_000_000);
    const host = env === "prod" ? "api.gerencianet.com.br" : "sandbox.gerencianet.com.br";
    const s = document.createElement("script");
    s.src = `https://${host}/v1/cdn/${payeeCode}/${v}`;
    s.async = false;
    s.id = payeeCode;
    s.onerror = () => reject(new Error("Falha ao carregar SDK Efí (verifique payee code)"));
    document.head.appendChild(s);
    const wait = setInterval(() => {
      if (window.$gn) { clearInterval(wait); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(wait); reject(new Error("Timeout carregando SDK Efí")); }, 15000);
  });
}

function tokenizeCard(card: {
  brand: string; number: string; cvv: string; expiration_month: string; expiration_year: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.$gn) return reject(new Error("SDK Efí não carregado"));
    window.$gn.ready((checkout) => {
      checkout.getPaymentToken(card, (err, res) => {
        if (err) return reject(err);
        resolve(res.data.payment_token);
      });
    });
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planName: string;
  priceCents: number;
  onSuccess?: () => void;
};

export function CardCheckoutDialog({ open, onOpenChange, planId, planName, priceCents, onSuccess }: Props) {
  const cfgFn = useServerFn(getEfiPublicConfigFn);
  const { data: cfg } = useQuery({ queryKey: ["efi-public-config"], queryFn: () => cfgFn(), enabled: open });
  const [loadingSdk, setLoadingSdk] = useState(false);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (!open || !cfg?.payeeCode || scriptLoaded.current) return;
    setLoadingSdk(true);
    loadEfiScript(cfg.payeeCode)
      .then(() => { scriptLoaded.current = true; })
      .catch((e) => toast.error(String(e.message ?? e)))
      .finally(() => setLoadingSdk(false));
  }, [open, cfg?.payeeCode]);

  // Form state
  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [holderName, setHolderName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  // billing address
  const [zipcode, setZipcode] = useState("");
  const [street, setStreet] = useState("");
  const [num, setNum] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const subscribe = useMutation({
    mutationFn: async () => {
      const cleanNumber = number.replace(/\s/g, "");
      const brand = detectBrand(cleanNumber);
      const payment_token = await tokenizeCard({
        brand, number: cleanNumber, cvv,
        expiration_month: expMonth.padStart(2, "0"),
        expiration_year: expYear.length === 2 ? `20${expYear}` : expYear,
      });
      const { data, error } = await supabase.functions.invoke("efi-subscribe-card", {
        body: {
          plan_id: planId,
          payment_token,
          customer: {
            name: holderName,
            cpf: cpf.replace(/\D/g, ""),
            email,
            phone_number: phone.replace(/\D/g, ""),
            birth, // YYYY-MM-DD
          },
          billing_address: {
            street, number: num, neighborhood,
            zipcode: zipcode.replace(/\D/g, ""),
            city, state,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.details?.error_description ?? data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Assinatura criada! 🎉");
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao processar pagamento"),
  });

  const priceFmt = (priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Assinar {planName}
          </DialogTitle>
          <DialogDescription>
            {priceFmt}/mês · cobrança recorrente automática · {cfg?.env === "prod" ? "Produção" : "Sandbox (teste)"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => { e.preventDefault(); subscribe.mutate(); }}
        >
          <div className="text-xs flex items-center gap-2 text-muted-foreground bg-muted/40 rounded-md p-2">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Os dados do cartão são tokenizados no seu navegador pela Efí — nunca tocam nosso servidor.
          </div>

          <div className="grid gap-2">
            <Label>Número do cartão</Label>
            <Input inputMode="numeric" maxLength={19} placeholder="0000 0000 0000 0000"
              value={number} onChange={(e) => setNumber(e.target.value)} required />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-2">
              <Label>Mês</Label>
              <Input inputMode="numeric" maxLength={2} placeholder="MM"
                value={expMonth} onChange={(e) => setExpMonth(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Ano</Label>
              <Input inputMode="numeric" maxLength={4} placeholder="AAAA"
                value={expYear} onChange={(e) => setExpYear(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>CVV</Label>
              <Input inputMode="numeric" maxLength={4} placeholder="123"
                value={cvv} onChange={(e) => setCvv(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2 col-span-2">
              <Label>Nome do titular</Label>
              <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>CPF</Label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Nascimento</Label>
              <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>

          <div className="border-t pt-3 grid grid-cols-6 gap-2">
            <div className="grid gap-2 col-span-2">
              <Label>CEP</Label>
              <Input value={zipcode} onChange={(e) => setZipcode(e.target.value)} required />
            </div>
            <div className="grid gap-2 col-span-4">
              <Label>Rua</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} required />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Número</Label>
              <Input value={num} onChange={(e) => setNum(e.target.value)} required />
            </div>
            <div className="grid gap-2 col-span-4">
              <Label>Bairro</Label>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} required />
            </div>
            <div className="grid gap-2 col-span-4">
              <Label>Cidade</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>UF</Label>
              <Input maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} required />
            </div>
          </div>

          <Button type="submit" disabled={loadingSdk || subscribe.isPending || !scriptLoaded.current} className="w-full">
            {subscribe.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
              : loadingSdk ? "Carregando..." : `Assinar por ${priceFmt}/mês`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
