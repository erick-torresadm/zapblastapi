import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ArrowLeft, AlertTriangle, ShieldCheck, Heart, MessageCircle, Gift, Mail, CheckCircle2, ArrowDownRight } from "lucide-react";
import { getBillingStateFn } from "@/lib/billing.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/cancelar")({
  head: () => ({ meta: [{ title: "Cancelar assinatura — Perseidas" }] }),
  component: CancelPage,
});

type Step = "retention" | "reason" | "confirm" | "done";

const REASONS: { value: string; label: string; counter: string }[] = [
  { value: "expensive", label: "Está caro pra mim agora", counter: "Posso te oferecer um desconto de boas-vindas-de-volta ou trocar para o Starter — fica bem mais barato e você mantém suas campanhas." },
  { value: "not_using", label: "Não estou usando o suficiente", counter: "Quer agendar 15 min com nosso time? A gente desenha um fluxo automático com você — quem usa converte 3x mais." },
  { value: "missing_feature", label: "Faltou uma funcionalidade", counter: "Nos conta qual — várias features do nosso roadmap saem do feedback de quem ia cancelar." },
  { value: "bans", label: "Meus chips estão caindo", counter: "Isso é o que mais nos importa. Antes de cancelar, fala com o suporte: 9 de cada 10 casos resolvem só ajustando aquecimento e velocidade." },
  { value: "moving", label: "Vou usar outra ferramenta", counter: "Topa nos contar qual? Se for por preço ou recurso, a gente tenta cobrir." },
  { value: "temporary", label: "Pausa temporária", counter: "Em vez de cancelar, posso te trocar para o Starter por R$ 49/mês até você voltar — assim você não perde a base." },
  { value: "other", label: "Outro motivo", counter: "Conta no campo abaixo. Lemos cada mensagem." },
];

function brl(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function CancelPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const billingFn = useServerFn(getBillingStateFn);
  const { data, isLoading } = useQuery({ queryKey: ["billing"], queryFn: () => billingFn() });

  const sub = data?.subscription;
  const plan = sub?.subscription_plans as { name?: string; price_cents?: number } | null | undefined;

  const [step, setStep] = useState<Step>("retention");
  const [reason, setReason] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessUntil, setAccessUntil] = useState<string | null>(null);

  const currentReason = useMemo(() => REASONS.find(r => r.value === reason), [reason]);
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  async function confirmCancel() {
    if (confirmText.trim().toUpperCase() !== "CANCELAR") {
      toast.error("Digite CANCELAR para confirmar.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("efi-cancel-subscription", {
        body: { reason, feedback },
      });
      if (error) throw new Error(error.message ?? "Falha ao cancelar");
      if ((r as { error?: string })?.error) throw new Error((r as { error: string }).error);
      setAccessUntil((r as { access_until?: string })?.access_until ?? null);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["plan-limits"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Sem assinatura paga → nada a cancelar
  if (!isLoading && (!sub || !sub.plan_id || sub.status === "canceled" || sub.cancel_at_period_end)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Button asChild variant="ghost" size="sm"><Link to="/app/billing"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
        <Card>
          <CardHeader>
            <CardTitle>Nada para cancelar</CardTitle>
            <CardDescription>
              {sub?.cancel_at_period_end
                ? `Sua assinatura já está marcada para encerrar em ${periodEnd ?? "—"}. Até lá você continua com acesso total.`
                : "Você não tem uma assinatura ativa no momento."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link to="/app/billing">Ver planos</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Button asChild variant="ghost" size="sm" className="self-start"><Link to="/app/billing"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar para assinatura</Link></Button>

      {/* ===== STEP 1: RETENÇÃO ===== */}
      {step === "retention" && (
        <>
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <CardTitle>Espera um instante</CardTitle>
              </div>
              <CardDescription>
                A gente sabe que você tem opções. Antes de você ir, deixa a gente tentar resolver o que te incomoda — costuma dar certo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan && (
                <div className="rounded-lg border border-border bg-background p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Seu plano hoje</div>
                      <div className="font-semibold">{plan.name}</div>
                    </div>
                    <Badge variant="outline">{brl(plan.price_cents ?? 0)}/mês</Badge>
                  </div>
                  {periodEnd && (
                    <div className="mt-2 text-xs text-muted-foreground">Próxima renovação: <strong className="text-foreground">{periodEnd}</strong></div>
                  )}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild variant="default" className="justify-start">
                  <a href="https://wa.me/5511999999999?text=Quero%20falar%20com%20o%20suporte%20antes%20de%20cancelar" target="_blank" rel="noopener">
                    <MessageCircle className="h-4 w-4 mr-2" /> Falar com suporte no WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/app/billing"><ArrowDownRight className="h-4 w-4 mr-2" /> Trocar para um plano mais barato</Link>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <a href="mailto:suporte@perseidas.app?subject=Cancelamento%20-%20preciso%20de%20ajuda"><Mail className="h-4 w-4 mr-2" /> Enviar e-mail</a>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <a href="/faq" target="_blank" rel="noopener"><Gift className="h-4 w-4 mr-2" /> Ver FAQ e dicas</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setStep("reason")}>
              Quero seguir com o cancelamento mesmo assim
            </Button>
          </div>
        </>
      )}

      {/* ===== STEP 2: MOTIVO ===== */}
      {step === "reason" && (
        <Card>
          <CardHeader>
            <CardTitle>Por que você quer cancelar?</CardTitle>
            <CardDescription>Selecione o motivo principal. Sua resposta nos ajuda a melhorar — e talvez a gente já resolva agora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                    reason === r.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${reason === r.value ? "border-primary bg-primary" : "border-muted-foreground/30"}`} />
                  <div>
                    <div className="font-medium">{r.label}</div>
                  </div>
                </button>
              ))}
            </div>

            {currentReason && (
              <Alert>
                <Heart className="h-4 w-4" />
                <AlertTitle>Antes de seguir — leia isso</AlertTitle>
                <AlertDescription>{currentReason.counter}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="feedback">Quer detalhar? (opcional)</Label>
              <Textarea
                id="feedback"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value.slice(0, 1000))}
                placeholder="Conta o que aconteceu — a gente lê cada mensagem."
                className="mt-1.5"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">{feedback.length}/1000</div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("retention")}>Voltar</Button>
              <Button onClick={() => setStep("confirm")} disabled={!reason} variant="destructive">
                Continuar para o cancelamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== STEP 3: CONFIRMAÇÃO + AVISOS LEGAIS ===== */}
      {step === "confirm" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>Confirmação final</CardTitle>
            </div>
            <CardDescription>Leia com atenção. Isto não pode ser desfeito automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>O que acontece quando você confirma</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc space-y-1.5">
                  <li>A próxima cobrança é cancelada na hora.</li>
                  <li>Seu acesso ao plano <strong>{plan?.name ?? "atual"}</strong> permanece ativo até <strong>{periodEnd ?? "o fim do período já pago"}</strong>.</li>
                  <li>Após essa data, seus chips desconectam, campanhas pausam e o CRM fica em modo somente leitura.</li>
                  <li>Seus dados (contatos, fluxos, histórico) ficam guardados por 90 dias. Basta reassinar para reativar.</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Política de reembolso (CDC Brasil)</AlertTitle>
              <AlertDescription>
                Conforme nossos Termos e o Código de Defesa do Consumidor, o cancelamento de planos contratados há mais de 7 dias <strong>não gera reembolso</strong> do período já pago. Você mantém o serviço até o fim do ciclo de cobrança e nada mais é cobrado a partir daí. O período de arrependimento de 7 dias só se aplica a novas contratações.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Motivo registrado:</strong> {currentReason?.label ?? "—"}
              {feedback && <div className="mt-1"><strong className="text-foreground">Detalhe:</strong> {feedback}</div>}
            </div>

            <div>
              <Label htmlFor="confirmText">
                Para confirmar, digite <strong className="text-destructive">CANCELAR</strong> no campo abaixo:
              </Label>
              <Input
                id="confirmText"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="CANCELAR"
                className="mt-1.5 font-mono uppercase"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("reason")} disabled={submitting}>Voltar</Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" disabled={submitting}>
                  <Link to="/app/billing">Não, mudei de ideia</Link>
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmCancel}
                  disabled={submitting || confirmText.trim().toUpperCase() !== "CANCELAR"}
                >
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelando...</> : "Confirmar cancelamento"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== STEP 4: DONE ===== */}
      {step === "done" && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <CardTitle>Cancelamento confirmado</CardTitle>
            </div>
            <CardDescription>
              Pronto. A próxima cobrança não vai acontecer. Você continua usando o {plan?.name ?? "plano"} até{" "}
              <strong>{accessUntil ? new Date(accessUntil).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : (periodEnd ?? "o fim do ciclo")}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Mudou de ideia antes do fim do ciclo? Basta reassinar em <Link to="/app/billing" className="text-primary underline-offset-2 hover:underline">Planos & Assinatura</Link> — tudo volta ao normal.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline"><Link to="/app">Voltar ao painel</Link></Button>
              <Button asChild><Link to="/app/billing">Ver minha assinatura</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
