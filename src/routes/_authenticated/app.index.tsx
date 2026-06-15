import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Send, MessageCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [instances, campaigns, sentToday, replies] = await Promise.all([
        supabase.from("whatsapp_instances").select("id,status", { count: "exact" }),
        supabase.from("campaigns").select("id,status", { count: "exact" }).in("status", ["running", "scheduled"]),
        supabase.from("campaign_messages").select("id", { count: "exact", head: true }).gte("sent_at", today.toISOString()).in("status", ["sent","delivered","read","replied"]),
        supabase.from("incoming_messages").select("id", { count: "exact", head: true }).gte("received_at", today.toISOString()),
      ]);
      const connected = (instances.data ?? []).filter((i) => i.status === "connected").length;
      return {
        connected,
        totalInstances: instances.count ?? 0,
        activeCampaigns: campaigns.count ?? 0,
        sentToday: sentToday.count ?? 0,
        repliesToday: replies.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Chips conectados", value: `${data?.connected ?? 0}/${data?.totalInstances ?? 0}`, icon: Smartphone },
    { label: "Campanhas ativas", value: data?.activeCampaigns ?? 0, icon: Send },
    { label: "Mensagens enviadas hoje", value: data?.sentToday ?? 0, icon: TrendingUp },
    { label: "Respostas hoje", value: data?.repliesToday ?? 0, icon: MessageCircle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua operação</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{s.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Como começar</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><strong>1.</strong> Cadastre seu servidor Evolution em <em>Servidores</em>.</p>
          <p><strong>2.</strong> Adicione chips em <em>Chips</em> e escaneie o QR code com o WhatsApp.</p>
          <p><strong>3.</strong> Faça upload de uma lista CSV em <em>Contatos</em>.</p>
          <p><strong>4.</strong> Crie uma campanha em <em>Campanhas</em> e dispare.</p>
        </CardContent>
      </Card>
    </div>
  );
}
