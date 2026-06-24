import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Trash2, Plus, Crown, Pencil } from "lucide-react";
import { adminListAllPlansFn, adminUpsertPlanFn, adminDeletePlanFn } from "@/lib/admin-plans.functions";

export const Route = createFileRoute("/_authenticated/_admin/app/admin/plans")({
  component: PlansAdminPage,
});

type FeatureKey =
  | "campaigns" | "crm" | "flows" | "warmup" | "agenda"
  | "traffic_funnels" | "group_campaigns"
  | "tools_maps" | "tools_unsaved_contacts" | "csv_export" | "api_access";

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: "campaigns", label: "Campanhas em massa" },
  { key: "crm", label: "CRM" },
  { key: "flows", label: "Fluxos / automação" },
  { key: "warmup", label: "Aquecimento" },
  { key: "agenda", label: "Agenda online" },
  { key: "traffic_funnels", label: "Funis de tráfego" },
  { key: "group_campaigns", label: "Campanhas de grupo" },
  { key: "tools_maps", label: "Ferramenta Google Maps" },
  { key: "tools_unsaved_contacts", label: "Contatos não salvos" },
  { key: "csv_export", label: "Exportar CSV" },
  { key: "api_access", label: "Acesso à API" },
];

const NUMERIC_LIMITS: { key: string; label: string }[] = [
  { key: "max_chips", label: "Chips simultâneos" },
  { key: "max_messages_per_day", label: "Mensagens por dia" },
  { key: "max_active_campaigns", label: "Campanhas ativas" },
  { key: "max_contacts_per_list", label: "Contatos por lista" },
  { key: "max_contact_lists", label: "Listas de contatos" },
  { key: "max_crm_agents", label: "Agentes CRM" },
  { key: "max_flows", label: "Fluxos" },
  { key: "max_traffic_funnels", label: "Funis de tráfego" },
  { key: "max_agenda_businesses", label: "Negócios na agenda" },
  { key: "max_group_campaigns", label: "Campanhas de grupo" },
  { key: "monthly_free_maps_searches", label: "Buscas Maps grátis/mês" },
];

type PlanRow = Record<string, unknown> & {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_annual_cents: number | null;
  featured: boolean;
  active: boolean;
  visible_public: boolean;
  sort_order: number;
  warmup_tier: "off" | "basic" | "advanced";
  has_agenda: boolean;
  feature_flags: Record<string, boolean> | null;
};

function brl(cents: number | null | undefined) {
  if (!cents && cents !== 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function PlansAdminPage() {
  const list = useServerFn(adminListAllPlansFn);
  const q = useQuery({ queryKey: ["admin-all-plans"], queryFn: () => list() });
  const plans = (q.data ?? []) as PlanRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Crown className="h-6 w-6" /> Planos</h1>
          <p className="text-muted-foreground">Crie, edite e configure todos os limites e recursos de cada plano.</p>
        </div>
        <PlanDialog mode="create" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos os planos</CardTitle>
          <CardDescription>{plans.length} plano(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Mensal</TableHead>
                <TableHead>Anual</TableHead>
                <TableHead>Chips</TableHead>
                <TableHead>Campanhas</TableHead>
                <TableHead>Visível</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    {p.featured && <Badge variant="secondary" className="mt-1">Destaque</Badge>}
                  </TableCell>
                  <TableCell><code className="text-xs">{p.slug}</code></TableCell>
                  <TableCell>{brl(p.price_cents)}</TableCell>
                  <TableCell>{brl(p.price_annual_cents)}</TableCell>
                  <TableCell>{(p["max_chips"] as number) === -1 ? "∞" : (p["max_chips"] as number)}</TableCell>
                  <TableCell>{(p["max_active_campaigns"] as number) === -1 ? "∞" : (p["max_active_campaigns"] as number)}</TableCell>
                  <TableCell>{p.visible_public ? "Pública" : "Oculta"}</TableCell>
                  <TableCell>{p.active ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <PlanDialog mode="edit" plan={p} />
                    <DeletePlanButton id={p.id} name={p.name} />
                  </TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum plano cadastrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DeletePlanButton({ id, name }: { id: string; name: string }) {
  const del = useServerFn(adminDeletePlanFn);
  const qc = useQueryClient();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={async () => {
        if (!confirm(`Excluir plano "${name}"? Só funciona se ninguém estiver usando.`)) return;
        try {
          await del({ data: { id } });
          toast.success("Plano excluído");
          qc.invalidateQueries({ queryKey: ["admin-all-plans"] });
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

type PlanFormState = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  price_reais: string;
  price_annual_reais: string;
  featured: boolean;
  active: boolean;
  visible_public: boolean;
  sort_order: number;
  warmup_tier: "off" | "basic" | "advanced";
  has_agenda: boolean;
  limits: Record<string, { value: number; unlimited: boolean }>;
  flags: Record<string, boolean>;
};

function planToForm(p?: PlanRow): PlanFormState {
  const limits: PlanFormState["limits"] = {};
  for (const { key } of NUMERIC_LIMITS) {
    const v = (p as Record<string, number> | undefined)?.[key];
    const isUnlim = v === -1;
    limits[key] = { value: isUnlim ? 0 : (v ?? 0), unlimited: isUnlim };
  }
  const defaultFlags: Record<string, boolean> = {};
  for (const { key } of FEATURES) defaultFlags[key] = true;
  return {
    id: p?.id,
    slug: p?.slug ?? "",
    name: p?.name ?? "",
    description: p?.description ?? "",
    price_reais: p ? ((p.price_cents ?? 0) / 100).toFixed(2) : "0",
    price_annual_reais: p?.price_annual_cents ? (p.price_annual_cents / 100).toFixed(2) : "",
    featured: p?.featured ?? false,
    active: p?.active ?? true,
    visible_public: p?.visible_public ?? true,
    sort_order: p?.sort_order ?? 100,
    warmup_tier: p?.warmup_tier ?? "off",
    has_agenda: p?.has_agenda ?? true,
    limits,
    flags: { ...defaultFlags, ...(p?.feature_flags ?? {}) },
  };
}

function PlanDialog({ mode, plan }: { mode: "create" | "edit"; plan?: PlanRow }) {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => planToForm(plan), [plan]);
  const [form, setForm] = useState<PlanFormState>(initial);
  const upsert = useServerFn(adminUpsertPlanFn);
  const qc = useQueryClient();

  function reset() { setForm(planToForm(plan)); }

  async function save() {
    const monthly = Math.round(parseFloat(form.price_reais.replace(",", ".") || "0") * 100);
    const annual = form.price_annual_reais
      ? Math.round(parseFloat(form.price_annual_reais.replace(",", ".") || "0") * 100)
      : null;
    const payload: Record<string, unknown> = {
      ...(form.id ? { id: form.id } : {}),
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      price_cents: monthly,
      price_annual_cents: annual,
      featured: form.featured,
      active: form.active,
      visible_public: form.visible_public,
      sort_order: form.sort_order,
      warmup_tier: form.warmup_tier,
      has_agenda: form.has_agenda,
      feature_flags: form.flags,
    };
    for (const { key } of NUMERIC_LIMITS) {
      payload[key] = form.limits[key].unlimited ? -1 : Math.max(0, Math.floor(form.limits[key].value));
    }
    try {
      await upsert({ data: payload as never });
      toast.success(mode === "create" ? "Plano criado" : "Plano atualizado");
      qc.invalidateQueries({ queryKey: ["admin-all-plans"] });
      qc.invalidateQueries({ queryKey: ["plan-limits"] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        {mode === "create"
          ? <Button><Plus className="mr-2 h-4 w-4" />Novo plano</Button>
          : <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo plano" : `Editar ${plan?.name}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Identidade */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Identidade</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="los-angeles" /></div>
            </div>
            <div><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Ordem</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
              <div className="flex items-end gap-2"><Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /><Label>Destaque</Label></div>
              <div className="flex items-end gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Ativo</Label></div>
              <div className="flex items-end gap-2"><Switch checked={form.visible_public} onCheckedChange={(v) => setForm({ ...form, visible_public: v })} /><Label>Visível público</Label></div>
            </div>
          </section>

          {/* Preço */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Preço (R$)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mensal</Label><Input value={form.price_reais} onChange={(e) => setForm({ ...form, price_reais: e.target.value })} /></div>
              <div><Label>Anual (vazio = sem opção anual)</Label><Input value={form.price_annual_reais} onChange={(e) => setForm({ ...form, price_annual_reais: e.target.value })} /></div>
            </div>
          </section>

          {/* Limites */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Limites numéricos</h3>
            <div className="grid grid-cols-2 gap-3">
              {NUMERIC_LIMITS.map(({ key, label }) => {
                const l = form.limits[key];
                return (
                  <div key={key} className="rounded-md border p-2">
                    <Label className="text-xs">{label}</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        disabled={l.unlimited}
                        value={l.value}
                        onChange={(e) => setForm({ ...form, limits: { ...form.limits, [key]: { ...l, value: Number(e.target.value) } } })}
                      />
                      <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                        <Switch
                          checked={l.unlimited}
                          onCheckedChange={(v) => setForm({ ...form, limits: { ...form.limits, [key]: { ...l, unlimited: v } } })}
                        />
                        ∞
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aquecimento</Label>
                <Select value={form.warmup_tier} onValueChange={(v) => setForm({ ...form, warmup_tier: v as PlanFormState["warmup_tier"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Desligado</SelectItem>
                    <SelectItem value="basic">Básico</SelectItem>
                    <SelectItem value="advanced">Avançado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={form.has_agenda} onCheckedChange={(v) => setForm({ ...form, has_agenda: v })} />
                <Label>Tem Agenda</Label>
              </div>
            </div>
          </section>

          {/* Feature flags */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Recursos habilitados</h3>
            <div className="grid grid-cols-2 gap-2">
              {FEATURES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Switch
                    checked={form.flags[key] ?? false}
                    onCheckedChange={(v) => setForm({ ...form, flags: { ...form.flags, [key]: v } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
