import { createFileRoute, notFound, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Calendar } from "lucide-react";
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
  notFoundComponent: () => <div className="p-10 text-center">Agendamento não encontrado.</div>,
  errorComponent: ({ error }) => <div className="p-10 text-center text-red-500">{error.message}</div>,
});

function ConfirmPage() {
  const data = Route.useLoaderData();
  const search = useSearch({ from: "/agenda/confirmar/$token" });
  const { token } = Route.useParams();
  const appt = data.appointment!;
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />{current.business_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm"><b>{current.service_name}</b> com <b>{current.professional_name}</b></div>
            <div className="text-sm text-muted-foreground">{new Date(current.starts_at).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}</div>
            <div className="text-sm text-muted-foreground">Cliente: {current.customer_name}</div>
          </div>

          {finished ? (
            <div className="text-center py-2 text-sm">
              {current.status === "cancelled" && <span className="text-red-500">Este agendamento foi cancelado.</span>}
              {current.status === "no_show" && <span className="text-red-500">Cliente não compareceu.</span>}
              {current.status === "done" && <span className="text-emerald-500">Atendimento realizado.</span>}
            </div>
          ) : confirmed ? (
            <div className="text-center py-2 text-emerald-600 flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Presença confirmada
              {(current.status === "confirmed_customer" || current.status === "confirmed_pro") && (
                <span className="text-xs text-muted-foreground">(aguardando a outra parte)</span>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Confirmar presença
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { if (confirm("Cancelar agendamento?")) cancelMut.mutate(); }} disabled={cancelMut.isPending}>
                <XCircle className="h-4 w-4 mr-1" />Cancelar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
