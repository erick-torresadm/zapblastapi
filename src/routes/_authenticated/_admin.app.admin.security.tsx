import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listSecurityEventsFn, listAdminAuditFn, listLoginAttemptsFn } from "@/lib/security.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, AlertTriangle, Activity, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/app/admin/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const eventsFn = useServerFn(listSecurityEventsFn);
  const auditFn = useServerFn(listAdminAuditFn);
  const attemptsFn = useServerFn(listLoginAttemptsFn);

  const events = useQuery({ queryKey: ["sec_events"], queryFn: () => eventsFn({ data: { limit: 200 } }), refetchInterval: 15000 });
  const audit = useQuery({ queryKey: ["sec_audit"], queryFn: () => auditFn({ data: { limit: 200 } }) });
  const attempts = useQuery({ queryKey: ["sec_attempts"], queryFn: () => attemptsFn({ data: { limit: 200, only_failed: true } }), refetchInterval: 15000 });

  const failedCount = (attempts.data?.rows ?? []).length;
  const criticalCount = (events.data?.rows ?? []).filter((e: { severity: string }) => e.severity === "critical").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">Segurança</h1>
          <p className="text-sm text-muted-foreground">Logs de autenticação, eventos críticos e auditoria de admins.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><KeyRound className="h-4 w-4" />Logins falhos (1h)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{failedCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Eventos críticos</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-destructive">{criticalCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />Ações admin</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{(audit.data?.rows ?? []).length}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="attempts">Tentativas de login</TabsTrigger>
          <TabsTrigger value="audit">Auditoria admin</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Severidade</TableHead><TableHead>IP</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
              <TableBody>
                {(events.data?.rows ?? []).map((e: { id: string; created_at: string; event_type: string; severity: string; ip: string | null; metadata: unknown }) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                    <TableCell><Badge variant={e.severity === "critical" ? "destructive" : e.severity === "warning" ? "secondary" : "outline"}>{e.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{e.ip ?? "—"}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs">{JSON.stringify(e.metadata ?? {})}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attempts" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>E-mail</TableHead><TableHead>IP</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(attempts.data?.rows ?? []).map((a: { id: string; created_at: string; email: string | null; ip: string | null; success: boolean }) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-sm">{a.email ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.ip ?? "—"}</TableCell>
                    <TableCell><Badge variant={a.success ? "outline" : "destructive"}>{a.success ? "ok" : "falha"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Ação</TableHead><TableHead>Alvo</TableHead><TableHead>Admin</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
              <TableBody>
                {(audit.data?.rows ?? []).map((a: { id: string; created_at: string; action: string; target_type: string | null; target_id: string | null; actor_user_id: string | null; ip: string | null }) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge>{a.action}</Badge></TableCell>
                    <TableCell className="text-xs">{a.target_type ?? "—"}/{a.target_id ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.actor_user_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
