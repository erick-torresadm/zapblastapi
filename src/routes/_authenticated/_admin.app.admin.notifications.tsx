import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminEventsFn, markEventReadFn, sendTestPushFn } from "@/lib/push.functions";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, CheckCheck, Send, Smartphone, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_admin/app/admin/notifications")({
  component: AdminNotificationsPage,
});

type EventRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  meta: unknown;
  created_at: string;
  read_at: string | null;
};

const TYPE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial_started: { label: "Trial", variant: "secondary" },
  payment_approved: { label: "Pagamento", variant: "default" },
  plan_blocked: { label: "Bloqueio", variant: "destructive" },
  test: { label: "Teste", variant: "outline" },
};

function AdminNotificationsPage() {
  const list = useServerFn(listAdminEventsFn);
  const markRead = useServerFn(markEventReadFn);
  const sendTest = useServerFn(sendTestPushFn);
  const qc = useQueryClient();
  const push = usePushSubscription();
  const [filter, setFilter] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["admin-events"],
    queryFn: () => list(),
    refetchInterval: 15000,
  });

  // Realtime — assim que insere evento, refetch
  useEffect(() => {
    const ch = supabase
      .channel("admin_push_events_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_push_events" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-events"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const events = ((data?.events ?? []) as EventRow[]).filter((e) => filter === "all" || e.type === filter);
  const types = Array.from(new Set((data?.events ?? []).map((e: EventRow) => e.type)));
  const unreadCount = (data?.events ?? []).filter((e: EventRow) => !e.read_at).length;

  const handleEnable = async () => {
    try { await push.enable(); toast.success("Notificações ativadas neste dispositivo."); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleDisable = async () => {
    await push.disable(); toast.success("Notificações desativadas.");
  };
  const handleTest = async () => {
    try { await sendTest(); toast.success("Notificação de teste enviada — deve chegar em até 1 minuto."); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleMarkRead = async (id: string) => {
    await markRead({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-events"] });
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Notificações Admin</h1>
        <p className="text-sm text-muted-foreground">
          Receba alertas no seu celular: novos trials, pagamentos aprovados, planos bloqueados e erros críticos.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">Push neste dispositivo</div>
              <div className="text-xs text-muted-foreground">
                {push.status === "unsupported" && "Navegador sem suporte. Instale o PWA e tente novamente."}
                {push.status === "denied" && "Permissão negada nas configurações do navegador."}
                {push.status === "granted" && (push.subscribed ? "Ativo." : "Permitido, mas não inscrito.")}
                {push.status === "default" && "Ainda não permitido."}
                {push.status === "loading" && "Verificando…"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {push.subscribed ? (
              <Button variant="outline" size="sm" onClick={handleDisable}>
                <BellOff className="mr-2 h-4 w-4" /> Desativar
              </Button>
            ) : (
              <Button size="sm" onClick={handleEnable} disabled={push.status === "unsupported"}>
                <Bell className="mr-2 h-4 w-4" /> Ativar push
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={handleTest}>
              <Send className="mr-2 h-4 w-4" /> Testar
            </Button>
          </div>
        </div>
        {push.status === "unsupported" && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
            <span>
              No iPhone, instale primeiro o app (Compartilhar → Adicionar à Tela de Início). iOS exige PWA instalado para push (iOS 16.4+).
            </span>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          Todas {unreadCount > 0 && <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>}
        </Button>
        {types.map((t) => (
          <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
            {TYPE_LABEL[t]?.label ?? t}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {events.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum evento ainda. Quando um usuário começar um trial, fizer pagamento ou tiver o plano bloqueado, aparece aqui.
          </Card>
        )}
        {events.map((e) => {
          const meta = TYPE_LABEL[e.type] ?? { label: e.type, variant: "outline" as const };
          return (
            <Card key={e.id} className={`p-4 ${e.read_at ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="font-medium">{e.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{e.body}</p>
                  <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
                </div>
                {!e.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => handleMarkRead(e.id)}>
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
