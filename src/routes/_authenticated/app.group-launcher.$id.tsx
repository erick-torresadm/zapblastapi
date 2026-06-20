import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Copy, ExternalLink, Trash2, RefreshCw, Loader2, ChevronRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getGroupCampaignFn, enqueueBulkCreateFn, pasteGroupLinksFn,
  updateGroupCampaignFn, updateGroupLinkFn, deleteGroupLinkFn,
} from "@/lib/group-launcher.functions";
import { listInstancesFn } from "@/lib/instances.functions";

export const Route = createFileRoute("/_authenticated/app/group-launcher/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getGroupCampaignFn);

  const { data, isLoading } = useQuery({
    queryKey: ["group-campaign", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 5000,
  });

  if (isLoading || !data) return <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  const { campaign, links, jobs } = data;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${campaign.slug}` : `/g/${campaign.slug}`;
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/group-launcher"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{campaign.name}</span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{campaign.name}</CardTitle>
              <CardDescription>Link público — compartilhe este endereço</CardDescription>
            </div>
            <Badge variant={campaign.is_active ? "default" : "secondary"}>
              {campaign.is_active ? "Ativa" : "Pausada"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-sm">{publicUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copiado"); }}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, "_blank")}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Grupos" value={links.length} />
            <Stat label="Ativos" value={links.filter((l) => l.status === "active").length} />
            <Stat label="Cheios" value={links.filter((l) => l.status === "full").length} />
            <Stat label="Cliques" value={campaign.click_count} />
          </div>
          {pendingJobs > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando {pendingJobs} grupo(s) em background…
            </div>
          )}
          {failedJobs.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div>{failedJobs.length} grupo(s) falharam na última criação.</div>
                <div className="text-xs opacity-90">{failedJobs[0].last_error}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="links">
        <TabsList>
          <TabsTrigger value="links">Grupos ({links.length})</TabsTrigger>
          <TabsTrigger value="add">Adicionar</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="mt-4">
          <LinksTable
            campaignId={campaign.id}
            memberLimit={campaign.member_limit}
            links={links}
          />
        </TabsContent>

        <TabsContent value="add" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <BulkCreateCard campaignId={campaign.id} />
            <PasteLinksCard campaignId={campaign.id} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsCard campaign={campaign} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-success text-success-foreground",
  full: "bg-warning text-warning-foreground",
  broken: "bg-destructive text-destructive-foreground",
  archived: "bg-muted text-muted-foreground",
};

function LinksTable({
  campaignId, memberLimit, links,
}: {
  campaignId: string;
  memberLimit: number;
  links: Array<{ id: string; title: string | null; position: number; status: string; member_count: number; invite_url: string | null; last_checked_at: string | null; source: string }>;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateGroupLinkFn);
  const removeFn = useServerFn(deleteGroupLinkFn);
  const update = useMutation({
    mutationFn: (p: { id: string; status?: string }) => updateFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-campaign", campaignId] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["group-campaign", campaignId] }); },
  });

  if (!links.length) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
      Nenhum grupo ainda. Vá em <strong>Adicionar</strong> para criar em lote ou colar links.
    </CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Membros</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((l) => {
              const pct = Math.min(100, Math.round((l.member_count / memberLimit) * 100));
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.position}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{l.title ?? "(sem nome)"}</div>
                      {l.invite_url && (
                        <a href={l.invite_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate block max-w-[260px]">
                          {l.invite_url.replace("https://", "")}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[l.status] ?? STATUS_COLORS.pending}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <div className="space-y-1">
                      <div className="text-xs">{l.member_count}/{memberLimit}</div>
                      <Progress value={pct} className="h-1" />
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{l.source}</span></TableCell>
                  <TableCell className="space-x-1">
                    {l.status === "active" ? (
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: l.id, status: "archived" })}>Arquivar</Button>
                    ) : l.status === "archived" || l.status === "broken" ? (
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: l.id, status: "active" })}>Reativar</Button>
                    ) : l.status === "pending" ? (
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: l.id, status: "active" })}>Ativar</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover este grupo da fila?")) remove.mutate(l.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BulkCreateCard({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const enqueueFn = useServerFn(enqueueBulkCreateFn);
  const [count, setCount] = useState(10);
  const [template, setTemplate] = useState("Lançamento #{n}");
  const [description, setDescription] = useState("");

  const mut = useMutation({
    mutationFn: () => enqueueFn({ data: { campaign_id: campaignId, count, subject_template: template, description: description || undefined } }),
    onSuccess: (r) => {
      toast.success(`${r.enqueued} grupo(s) na fila — serão criados em ~${Math.ceil(r.enqueued * 2.5 / 60)} min`);
      qc.invalidateQueries({ queryKey: ["group-campaign", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Criar em lote</CardTitle>
        <CardDescription>O próprio número do chip é adicionado como participante inicial (exigência do WhatsApp). Throttle de ~2,5s entre cada grupo para evitar ban.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <Label>Nome do grupo</Label>
          <Input value={template} onChange={(e) => setTemplate(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Use <code>{"{n}"}</code> para numerar. Ex: <code>"VIP #01"</code>, <code>"VIP #02"</code>…</p>
        </div>
        <div>
          <Label>Descrição (opcional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !template || count < 1} className="w-full">
          {mut.isPending ? "Enfileirando…" : `Criar ${count} grupo(s)`}
        </Button>
      </CardContent>
    </Card>
  );
}

function PasteLinksCard({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const pasteFn = useServerFn(pasteGroupLinksFn);
  const [raw, setRaw] = useState("");

  const mut = useMutation({
    mutationFn: () => pasteFn({ data: { campaign_id: campaignId, raw } }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} link(s) adicionados`);
      setRaw("");
      qc.invalidateQueries({ queryKey: ["group-campaign", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Colar links existentes</CardTitle>
        <CardDescription>Cole URLs de convite (chat.whatsapp.com/…), um por linha ou separados por espaço/vírgula.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder="https://chat.whatsapp.com/AbcDef123&#10;https://chat.whatsapp.com/XyzGhi456"
          className="font-mono text-xs"
        />
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !raw.trim()} className="w-full">
          {mut.isPending ? "Importando…" : "Importar links"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SettingsCard({ campaign }: { campaign: { id: string; name: string; slug: string; member_limit: number; instance_id: string | null; is_active: boolean; default_description: string | null; default_image_url: string | null } }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateGroupCampaignFn);
  const instancesFn = useServerFn(listInstancesFn);
  const [name, setName] = useState(campaign.name);
  const [slug, setSlug] = useState(campaign.slug);
  const [limit, setLimit] = useState(campaign.member_limit);
  const [instanceId, setInstanceId] = useState(campaign.instance_id ?? "");
  const [active, setActive] = useState(campaign.is_active);

  const { data: instances } = useQuery({
    queryKey: ["instances"],
    queryFn: () => instancesFn({ data: undefined as never }),
  });

  const mut = useMutation({
    mutationFn: () => updateFn({ data: {
      id: campaign.id, name, slug, member_limit: limit,
      instance_id: instanceId || null, is_active: active,
    } }),
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["group-campaign", campaign.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Slug (URL pública)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </div>
          <div>
            <Label>Limite de membros</Label>
            <Input type="number" min={50} max={1024} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>
          <div>
            <Label>Instância</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(instances ?? []).map((i: { id: string; instance_name: string }) => (
                  <SelectItem key={i.id} value={i.id}>{i.instance_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Campanha ativa (link público redireciona quando ativada)
        </label>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </CardContent>
    </Card>
  );
}
