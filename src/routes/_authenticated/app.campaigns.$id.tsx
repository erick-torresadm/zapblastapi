import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/app/campaigns/$id")({ component: CampaignDetail });

const msgStatusCls: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sending: "bg-warning text-warning-foreground",
  sent: "bg-primary/20 text-primary",
  delivered: "bg-success/20 text-success",
  read: "bg-success text-success-foreground",
  failed: "bg-destructive text-destructive-foreground",
  replied: "bg-accent text-accent-foreground",
};

function CampaignDetail() {
  const { id } = Route.useParams();

  const { data: campaign, refetch: refetchCamp } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["campaign-stats", id],
    queryFn: async () => {
      const { data } = await supabase.from("campaign_messages")
        .select("status")
        .eq("campaign_id", id);
      const counts: Record<string, number> = {};
      for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return counts;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["campaign-msgs", id],
    queryFn: async () =>
      (await supabase.from("campaign_messages").select("*").eq("campaign_id", id).order("updated_at", { ascending: false }).limit(100)).data ?? [],
  });

  useEffect(() => {
    if (campaign?.status === "running") {
      const t = setInterval(() => { refetchCamp(); refetchStats(); }, 5000);
      return () => clearInterval(t);
    }
  }, [campaign?.status, refetchCamp, refetchStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/app/campaigns"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">{campaign?.name ?? "Campanha"}</h1>
          <p className="text-sm text-muted-foreground">Status: {campaign?.status}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {["pending","sent","delivered","read","failed"].map((k) => (
          <Card key={k}>
            <CardHeader className="pb-2"><CardTitle className="text-sm capitalize">{k}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats?.[k] ?? 0}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Últimas mensagens (100)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Telefone</TableHead><TableHead>Mensagem</TableHead><TableHead>Status</TableHead><TableHead>Enviada</TableHead></TableRow></TableHeader>
            <TableBody>
              {messages?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.phone}</TableCell>
                  <TableCell className="max-w-md truncate text-xs">{m.rendered_message}</TableCell>
                  <TableCell><Badge className={msgStatusCls[m.status] ?? ""}>{m.status}</Badge></TableCell>
                  <TableCell className="text-xs">{m.sent_at ? new Date(m.sent_at).toLocaleString("pt-BR") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
