// Dashboard do módulo Tráfego — lista funis e cria novo.
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFunnelsFn, createFunnelFn, deleteFunnelFn } from "@/lib/traffic.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ExternalLink, Trash2, Pencil, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/traffic/")({
  component: TrafficDashboard,
});

function TrafficDashboard() {
  const list = useServerFn(listFunnelsFn);
  const create = useServerFn(createFunnelFn);
  const del = useServerFn(deleteFunnelFn);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: funnels } = useSuspenseQuery({
    queryKey: ["traffic-funnels"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<"funnel" | "linkbio" | "quiz">("quiz");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const f = await create({ data: { slug, title, template } });
      toast.success("Funil criado");
      setOpen(false);
      setSlug(""); setTitle("");
      qc.invalidateQueries({ queryKey: ["traffic-funnels"] });
      router.navigate({ to: "/app/traffic/$id/editor", params: { id: f.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este funil? Esta ação não pode ser desfeita.")) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["traffic-funnels"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tráfego &amp; Funis</h1>
          <p className="text-sm text-muted-foreground">Crie funis, link-in-bio e páginas de captura com Pixel + CAPI nativos.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo funil</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {funnels.length === 0 && (
          <Card className="col-span-full p-8 text-center text-muted-foreground">
            Você ainda não tem funis. Clique em "Novo funil" para começar.
          </Card>
        )}
        {funnels.map((f) => (
          <Card key={f.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{f.title}</h3>
                <p className="text-xs text-muted-foreground truncate">/f/{f.slug}</p>
              </div>
              <Badge variant={f.status === "published" ? "default" : "secondary"}>
                {f.status === "published" ? "Publicado" : "Rascunho"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/app/traffic/$id/editor" params={{ id: f.id }}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/traffic/$id/analytics" params={{ id: f.id }}><BarChart3 className="h-3.5 w-3.5 mr-1" />Analytics</Link>
              </Button>
              {f.status === "published" && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />Abrir</a>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo funil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Título</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Lançamento black friday" />
            </div>
            <div>
              <label className="text-xs font-medium">Slug (URL)</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="black-friday"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Sua URL: /f/{slug || "..."}</p>
            </div>
            <div>
              <label className="text-xs font-medium">Template</label>
              <Select value={template} onValueChange={(v) => setTemplate(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quiz">Quiz interativo (multi-step)</SelectItem>
                  <SelectItem value="funnel">Funil de captura</SelectItem>
                  <SelectItem value="linkbio">Link-in-bio</SelectItem>
                </SelectContent>
              </Select>

            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy || !slug || !title} onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
