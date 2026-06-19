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
