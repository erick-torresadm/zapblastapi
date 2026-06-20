import { createFileRoute, notFound, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Calendar, Clock, User, Sparkles, MapPin } from "lucide-react";
import { getAppointmentByTokenFn, confirmAppointmentFn, cancelAppointmentByTokenFn } from "@/lib/agenda-public.functions";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({ by: z.enum(["customer", "professional"]).optional() });

export const Route = createFileRoute("/agenda/confirmar/$token")({
  validateSearch: searchSchema,
  loader: async ({ params }) => {
    const data = await getAppointmentByTokenFn({ data: { token: params.token } });
    if (!data.found) throw notFound();
    return data;
  },
  component: ConfirmPage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center p-8">
        <XCircle className="h-12 w-12 mx-auto text-red-500 mb-3" />
        <h1 className="font-semibold text-lg">Agendamento não encontrado</h1>
        <p className="text-sm text-muted-foreground mt-2">O link pode ter expirado ou ser inválido.</p>
      </Card>
    </div>
  ),
  errorComponent: ({ error }) => <div className="p-10 text-center text-red-500">{error.message}</div>,
});

function ConfirmPage() {
  const data = Route.useLoaderData();
  const search = useSearch({ from: "/agenda/confirmar/$token" });
  const { token } = Route.useParams();
  const by = search.by ?? "customer";

  const confirmFn = useServerFn(confirmAppointmentFn);
  const cancelFn = useServerFn(cancelAppointmentByTokenFn);

  const refetch = useQuery({
    queryKey: ["agenda-token", token],
    queryFn: () => getAppointmentByTokenFn({ data: { token } }) as unknown as Promise<typeof data>,
    initialData: data,
  });
  const current = refetch.data.appointment!;

  const confirmMut = useMutation({
    mutationFn: () => confirmFn({ data: { token, by } }) as unknown as Promise<{ ok: boolean; message?: string }>,
    onSuccess: (r) => { if (r.ok) { toast.success("Presença confirmada!"); refetch.refetch(); } else toast.error(r.message || "Erro"); },
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { token } }) as unknown as Promise<{ ok: boolean; message?: string }>,
    onSuccess: (r) => { if (r.ok) { toast.success("Cancelado."); refetch.refetch(); } else toast.error(r.message || "Erro"); },
  });

  const finished = ["cancelled", "no_show", "done"].includes(current.status);
  const confirmed = current.status.startsWith("confirmed");
  const dt = new Date(current.starts_at);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-muted/30">
      <Card className="max-w-md w-full overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <CardHeader className="text-center pb-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Calendar className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">{current.business_name}</CardTitle>
          <p className="text-xs text-muted-foreground">Detalhes do seu agendamento</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><b>{current.service_name}</b></div>
            <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" />com <b className="text-foreground">{current.professional_name}</b></div>
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />{dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" />{dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="flex items-center gap-2 text-muted-foreground pt-1 border-t mt-2"><MapPin className="h-4 w-4" />Cliente: {current.customer_name}</div>
          </div>

          {finished ? (
            <div className="text-center py-4 rounded-xl border bg-muted/20">
              {current.status === "cancelled" && (
                <div className="space-y-1"><XCircle className="h-8 w-8 mx-auto text-red-500" /><p className="text-sm font-medium text-red-600">Agendamento cancelado</p></div>
              )}
              {current.status === "no_show" && (
                <div className="space-y-1"><XCircle className="h-8 w-8 mx-auto text-red-500" /><p className="text-sm font-medium text-red-600">Cliente não compareceu</p></div>
              )}
              {current.status === "done" && (
                <div className="space-y-1"><CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" /><p className="text-sm font-medium text-emerald-600">Atendimento realizado</p></div>
              )}
            </div>
          ) : confirmed ? (
            <div className="text-center py-5 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Presença confirmada</p>
              {(current.status === "confirmed_customer" || current.status === "confirmed_pro") && (
                <p className="text-xs text-muted-foreground">Aguardando confirmação da outra parte.</p>
              )}
              <p className="text-xs text-muted-foreground">Te esperamos no horário marcado. 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-center text-muted-foreground">Confirme sua presença para garantir o horário.</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />Confirmar
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { if (confirm("Cancelar agendamento?")) cancelMut.mutate(); }} disabled={cancelMut.isPending}>
                  <XCircle className="h-4 w-4 mr-1" />Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        <p className="text-center text-[11px] text-muted-foreground pb-4">Powered by Perseidas</p>
      </Card>
    </div>
  );
}
