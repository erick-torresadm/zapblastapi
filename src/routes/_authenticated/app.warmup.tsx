import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame, RotateCcw, Activity, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { toggleWarmupFn, resetWarmupFn } from "@/lib/warmup.functions";
import { formatPhone } from "@/lib/format-instance";

export const Route = createFileRoute("/_authenticated/app/warmup")({ component: WarmupPage });

const intensityLabel: Record<string, string> = { leve: "Leve (20/dia)", medio: "Médio (50/dia)", forte: "Forte (100/dia)" };
const quota: Record<string, number> = { leve: 20, medio: 50, forte: 100 };

function warmupDay(startedAt: string | null): number {
  if (!startedAt) return 0;
  const diff = Date.now() - new Date(startedAt).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function WarmupPage() {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleWarmupFn);
  const resetFn = useServerFn(resetWarmupFn);

  const { data: instances } = useQuery({
    queryKey: ["instances-warmup"],
    queryFn: async () => (await supabase.from("whatsapp_instances")
      .select("id, instance_name, phone_number, status, warmup_enabled, warmup_intensity, warmup_started_at, warmup_sent_today, warmup_total_sent, warmup_last_at, health_score")
      .order("created_at", { ascending: false })).data ?? [],
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ["warmup-stats-today"],
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabase.from("warmup_conversations")
        .select("id", { count: "exact", head: true }).gte("sent_at", since.toISOString());
      const { count: pending } = await supabase.from("warmup_conversations")
        .select("id", { count: "exact", head: true }).eq("replied", false).not("reply_due_at", "is", null);
      return { sentToday: sentToday ?? 0, pending: pending ?? 0 };
    },
    refetchInterval: 15000,
  });

  const toggle = useMutation({
    mutationFn: async (vars: { instance_id: string; enabled: boolean; intensity?: "leve" | "medio" | "forte" }) =>
      toggleFn({ data: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instances-warmup"] }); toast.success("Atualizado"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const reset = useMutation({
    mutationFn: async (instance_id: string) => resetFn({ data: { instance_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instances-warmup"] }); toast.success("Aquecimento reiniciado"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const enabledCount = instances?.filter((i) => i.warmup_enabled).length ?? 0;
  const connectedEnabled = instances?.filter((i) => i.warmup_enabled && i.status === "connected").length ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Flame className="h-6 w-6 text-orange-500" /> Aquecimento de Chips</h1>
        <p className="text-muted-foreground">Seus chips conversam entre si para aumentar a reputação no WhatsApp antes do disparo real.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Em aquecimento</CardDescription><CardTitle className="text-3xl">{enabledCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Conectados ativos</CardDescription><CardTitle className="text-3xl">{connectedEnabled}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Msgs trocadas hoje</CardDescription><CardTitle className="text-3xl">{stats?.sentToday ?? 0}</CardTitle></CardHeader></Card>
      </div>

      {connectedEnabled === 1 && (
        <Card className="border-warning">
          <CardContent className="pt-6 text-sm">
            ⚠️ Aquecimento precisa de pelo menos <strong>2 chips conectados</strong> com o modo ligado para que conversem entre si.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {(instances ?? []).map((i) => {
          const day = warmupDay(i.warmup_started_at);
          const max = quota[i.warmup_intensity] ?? 20;
          const pct = Math.min(100, Math.round((i.warmup_sent_today / max) * 100));
          return (
            <Card key={i.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {i.instance_name}
                    <Badge variant={i.status === "connected" ? "default" : "secondary"}>{i.status}</Badge>
                    {i.warmup_enabled && <Badge className="bg-orange-500 hover:bg-orange-600">🔥 Aquecendo</Badge>}
                  </CardTitle>
                  <CardDescription>{i.phone_number ?? "Sem número"} · Saúde: {i.health_score}%</CardDescription>
                </div>
                <Switch
                  checked={i.warmup_enabled}
                  disabled={i.status !== "connected"}
                  onCheckedChange={(v) => toggle.mutate({ instance_id: i.id, enabled: v })}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Intensidade</div>
                    <Select
                      value={i.warmup_intensity}
                      onValueChange={(v) => toggle.mutate({ instance_id: i.id, enabled: i.warmup_enabled, intensity: v as "leve" | "medio" | "forte" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(intensityLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Dia do aquecimento</div>
                    <div className="flex items-center gap-2 text-2xl font-semibold"><Activity className="h-5 w-5 text-muted-foreground" />{day || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total enviado</div>
                    <div className="flex items-center gap-2 text-2xl font-semibold"><MessageCircle className="h-5 w-5 text-muted-foreground" />{i.warmup_total_sent}</div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Hoje</span><span>{i.warmup_sent_today} / {max}</span>
                  </div>
                  <Progress value={pct} />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => reset.mutate(i.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Reiniciar aquecimento
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(instances ?? []).length === 0 && (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">Conecte chips primeiro na aba <strong>Chips</strong>.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
