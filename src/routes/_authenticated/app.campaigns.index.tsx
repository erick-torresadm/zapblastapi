import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Pause, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { startCampaignFn, pauseCampaignFn } from "@/lib/campaigns.functions";
import { usePlanLimits } from "@/hooks/usePlanLimits";

export const Route = createFileRoute("/_authenticated/app/campaigns/")({ component: CampaignsPage });

const statusMap: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendada", cls: "bg-warning text-warning-foreground" },
  running: { label: "Executando", cls: "bg-primary text-primary-foreground" },
  paused: { label: "Pausada", cls: "bg-muted text-muted-foreground" },
  completed: { label: "Concluída", cls: "bg-success text-success-foreground" },
  failed: { label: "Falhou", cls: "bg-destructive text-destructive-foreground" },
};

function CampaignsPage() {
  const qc = useQueryClient();
  const startFn = useServerFn(startCampaignFn);
  const pauseFn = useServerFn(pauseCampaignFn);

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const start = useMutation({
    mutationFn: async (id: string) => startFn({ data: { campaign_id: id } }),
    onSuccess: () => { toast.success("Campanha iniciada"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pause = useMutation({
    mutationFn: async (id: string) => pauseFn({ data: { campaign_id: id } }),
    onSuccess: () => { toast.success("Campanha pausada"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("campaigns").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removida"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie seus disparos</p>
        </div>
        <NewCampaignButton />
      </div>
      <PastDueAlert />

      <Card>
        <CardHeader><CardTitle>Todas</CardTitle></CardHeader>
        <CardContent>
          {!campaigns?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead>Progresso</TableHead><TableHead>Falhas</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const s = statusMap[c.status] ?? statusMap.draft;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge className={s.cls}>{s.label}</Badge></TableCell>
                      <TableCell>{c.sent_count}/{c.total_messages}</TableCell>
                      <TableCell>{c.failed_count}</TableCell>
                      <TableCell className="space-x-1">
                        {(c.status === "draft" || c.status === "paused") && (
                          <Button variant="ghost" size="icon" title="Iniciar" onClick={() => start.mutate(c.id)}><Play className="h-4 w-4" /></Button>
                        )}
                        {(c.status === "running" || c.status === "scheduled") && (
                          <Button variant="ghost" size="icon" title="Pausar" onClick={() => pause.mutate(c.id)}><Pause className="h-4 w-4" /></Button>
                        )}
                        <Button asChild variant="ghost" size="icon"><Link to="/app/campaigns/$id" params={{ id: c.id }}><Eye className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover campanha?")) remove.mutate(c.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewCampaignButton() {
  const limits = usePlanLimits();
  // Criar rascunho é sempre permitido — o limite de campanhas ATIVAS só vale na hora de iniciar/agendar.
  // Se o teste/assinatura está expirado, aí sim bloqueamos com link pro upgrade.
  if (!limits.canAct) {
    return (
      <Button asChild variant="outline" title="Teste grátis expirado. Assine pra criar campanhas.">
        <Link to="/app/billing"><Plus className="mr-2 h-4 w-4" />Assinar para criar</Link>
      </Button>
    );
  }
  const atLimit = !limits.canCreateCampaign;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button asChild><Link to="/app/campaigns/new"><Plus className="mr-2 h-4 w-4" />Nova campanha</Link></Button>
      {atLimit && (
        <span className="text-xs text-muted-foreground">
          Você está no limite de {limits.data?.limits?.max_active_campaigns} campanha(s) ativa(s) do plano {limits.plan}. Pode criar o rascunho — pra iniciar, pause/exclua uma ativa ou{" "}
          <Link to="/app/billing" className="underline">faça upgrade</Link>.
        </span>
      )}
    </div>
  );
}

function PastDueAlert() {
  const limits = usePlanLimits();
  if (!limits.isPastDue) return null;
  return (
    <Card className="border-destructive bg-destructive/10">
      <CardContent className="py-4 text-sm">
        ⚠️ <strong>Teste grátis expirado.</strong> Campanhas em execução estão pausadas e novos disparos bloqueados.{" "}
        <Link to="/app/billing" className="font-semibold text-primary underline-offset-2 hover:underline">Assinar agora</Link>
      </CardContent>
    </Card>
  );
}
