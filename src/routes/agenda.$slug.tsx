import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { getPublicBusinessFn, getPublicSlotsFn, bookAppointmentFn } from "@/lib/agenda-public.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/agenda/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicBusinessFn({ data: { slug: params.slug } });
    if (!data.found || !data.business) throw notFound();
    return data;
  },
  component: PublicAgenda,
  notFoundComponent: () => <div className="p-10 text-center">Agenda não encontrada.</div>,
  errorComponent: ({ error }) => <div className="p-10 text-center text-red-500">{error.message}</div>,
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.business ? `Agendar — ${loaderData.business.name}` : "Agendar" },
      { name: "description", content: `Agende seu horário em ${loaderData?.business?.name ?? ""}` },
    ],
  }),
});

type Service = { id: string; name: string; description: string | null; duration_min: number; price_cents: number; professional_ids: string[] };
type Pro = { id: string; name: string; color: string | null; avatar_url: string | null };

function PublicAgenda() {
  const data = Route.useLoaderData();
  const biz = data.business!;
  const services = data.services ?? [];
  const pros = data.professionals ?? [];

  const [step, setStep] = useState<"service"|"pro"|"date"|"form"|"done">("service");
  const [svc, setSvc] = useState<Service | null>(null);
  const [pro, setPro] = useState<Pro | null>(null);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const getSlots = useServerFn(getPublicSlotsFn);
  const book = useServerFn(bookAppointmentFn);

  const { data: slots = [] } = useQuery({
    queryKey: ["public-slots", svc?.id, pro?.id, dateStr],
    enabled: !!svc && !!pro,
    queryFn: () => getSlots({ data: { business_id: biz.id, service_id: svc!.id, professional_id: pro!.id, date: dateStr } }) as unknown as Promise<Array<{ starts_at: string; ends_at: string }>>,
  });

  const bookMut = useMutation({
    mutationFn: () => book({ data: {
      business_id: biz.id, service_id: svc!.id, professional_id: pro!.id, starts_at: slot!,
      customer_name: form.name, customer_phone: form.phone, customer_notes: form.notes,
    } }) as unknown as Promise<{ ok: boolean; message?: string; confirm_token?: string }>,
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.message || "Erro"); return; }
      setConfirmToken(r.confirm_token ?? null);
      setStep("done");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accent = biz.primary_color || "#6366f1";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-xl mx-auto p-4 md:p-8">
        <Card>
          <CardHeader style={{ borderBottom: `3px solid ${accent}` }}>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" style={{ color: accent }} />{biz.name}</CardTitle>
            {biz.about && <CardDescription>{biz.about}</CardDescription>}
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {step === "service" && (
              <>
                <h2 className="font-semibold">Escolha o serviço</h2>
                {services.length === 0 && <p className="text-sm text-muted-foreground">Nenhum serviço disponível.</p>}
                {services.map((s) => (
                  <button key={s.id} onClick={() => { setSvc(s); setStep("pro"); }} className="w-full text-left p-3 rounded-lg border hover:border-primary transition">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.duration_min}min{s.price_cents > 0 ? ` · R$ ${(s.price_cents / 100).toFixed(2)}` : ""}</div>
                    {s.description && <div className="text-xs mt-1">{s.description}</div>}
                  </button>
                ))}
              </>
            )}

            {step === "pro" && svc && (
              <>
                <button onClick={() => setStep("service")} className="text-xs flex items-center gap-1 text-muted-foreground"><ArrowLeft className="h-3 w-3" />Voltar</button>
                <h2 className="font-semibold">Escolha o profissional</h2>
                {pros.filter((p) => svc.professional_ids.includes(p.id)).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado para este serviço.</p>
                )}
                {pros.filter((p) => svc.professional_ids.includes(p.id)).map((p) => (
                  <button key={p.id} onClick={() => { setPro(p); setStep("date"); }} className="w-full text-left p-3 rounded-lg border hover:border-primary transition flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: p.color || accent }} />
                    <span className="font-medium">{p.name}</span>
                  </button>
                ))}
              </>
            )}

            {step === "date" && svc && pro && (
              <>
                <button onClick={() => setStep("pro")} className="text-xs flex items-center gap-1 text-muted-foreground"><ArrowLeft className="h-3 w-3" />Voltar</button>
                <h2 className="font-semibold">Escolha data e horário</h2>
                <Input type="date" min={new Date().toISOString().slice(0, 10)} value={dateStr} onChange={(e) => { setDateStr(e.target.value); setSlot(null); }} />
                <div className="grid grid-cols-3 gap-2 max-h-80 overflow-auto">
                  {slots.length === 0 && <p className="col-span-3 text-sm text-muted-foreground text-center py-4">Nenhum horário livre nesta data.</p>}
                  {slots.map((s) => {
                    const t = new Date(s.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    const active = slot === s.starts_at;
                    return (
                      <button key={s.starts_at} onClick={() => setSlot(s.starts_at)}
                        className={`p-2 rounded border text-sm ${active ? "border-primary bg-primary/10 font-semibold" : "hover:border-primary"}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
                <Button className="w-full" disabled={!slot} onClick={() => setStep("form")}>Continuar</Button>
              </>
            )}

            {step === "form" && svc && pro && slot && (
              <>
                <button onClick={() => setStep("date")} className="text-xs flex items-center gap-1 text-muted-foreground"><ArrowLeft className="h-3 w-3" />Voltar</button>
                <h2 className="font-semibold">Seus dados</h2>
                <div className="p-3 rounded bg-muted text-xs">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {new Date(slot).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })} · {svc.name} com {pro.name}
                </div>
                <div><Label>Nome completo</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="11999999999" /></div>
                <div><Label>Observações (opcional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button className="w-full" disabled={!form.name || !form.phone || bookMut.isPending} onClick={() => bookMut.mutate()}>
                  Confirmar agendamento
                </Button>
              </>
            )}

            {step === "done" && (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
                <h2 className="font-semibold text-lg">Agendamento confirmado!</h2>
                <p className="text-sm text-muted-foreground">Você receberá uma mensagem no WhatsApp com o lembrete.</p>
                {confirmToken && (
                  <a className="text-primary hover:underline text-sm" href={`/agenda/confirmar/${confirmToken}`}>Ver detalhes</a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-3">Powered by ZapBlast</p>
      </div>
    </div>
  );
}
