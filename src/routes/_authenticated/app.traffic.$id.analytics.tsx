// Analytics simples por funil — totais por evento + leads recentes.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFunnelAnalyticsFn, getFunnelFn } from "@/lib/traffic.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/traffic/$id/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { id } = Route.useParams();
  const getAna = useServerFn(getFunnelAnalyticsFn);
  const getF = useServerFn(getFunnelFn);
  const { data: ana } = useSuspenseQuery({ queryKey: ["traffic-ana", id], queryFn: () => getAna({ data: { funnel_id: id } }) });
  const { data: fd } = useSuspenseQuery({ queryKey: ["traffic-funnel", id], queryFn: () => getF({ data: { id } }) });

  const totals = ana.totals as Record<string, number>;
  const totalsEntries = Object.entries(totals);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/app/traffic"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
          <h1 className="text-lg font-semibold">Analytics — {fd.funnel.title}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/traffic/$id/editor" params={{ id }}>Editar funil</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {totalsEntries.length === 0 && <Card className="col-span-full p-6 text-center text-sm text-muted-foreground">Sem eventos ainda nos últimos 30 dias.</Card>}
        {totalsEntries.map(([name, count]) => (
          <Card key={name} className="p-4">
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="text-2xl font-bold">{count}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Leads recentes</h2>
        {ana.leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead capturado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 px-1">Quando</th>
                  <th className="text-left py-2 px-1">Nome</th>
                  <th className="text-left py-2 px-1">Telefone</th>
                  <th className="text-left py-2 px-1">Email</th>
                  <th className="text-left py-2 px-1">UTM Source</th>
                </tr>
              </thead>
              <tbody>
                {ana.leads.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="py-2 px-1">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="py-2 px-1">{l.name ?? "-"}</td>
                    <td className="py-2 px-1">{l.phone ?? "-"}</td>
                    <td className="py-2 px-1">{l.email ?? "-"}</td>
                    <td className="py-2 px-1">{((l.utm as Record<string, string> | null)?.utm_source) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Últimos eventos</h2>
        {ana.recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
        ) : (
          <ul className="text-sm divide-y">
            {ana.recentEvents.slice(0, 50).map((e, i) => (
              <li key={i} className="py-2 flex items-center justify-between">
                <span>{e.event_name}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                {e.capi_status && <Badge variant="outline">{e.capi_status}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
