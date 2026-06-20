import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, Trash2, Link2, Copy, Users, Wrench, Clock, Sparkles, CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getMyBusinessFn, upsertBusinessFn,
  listProfessionalsFn, upsertProfessionalFn, deleteProfessionalFn,
  listServicesFn, upsertServiceFn, deleteServiceFn,
  listAvailabilityFn, setAvailabilityFn,
  listAppointmentsFn, updateAppointmentStatusFn,
  listReengagementFn, upsertReengagementFn, deleteReengagementFn,
} from "@/lib/agenda.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/agenda")({ component: AgendaPage });

type Business = {
  id: string; slug: string; name: string; about: string | null; timezone: string;
  default_instance_id: string | null; confirm_offsets_minutes: number[];
  notify_professional: boolean; primary_color: string | null; active: boolean;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AgendaPage() {
  const getBiz = useServerFn(getMyBusinessFn);
  const { data: business, isLoading } = useQuery<Business | null>({
    queryKey: ["agenda-business"],
    queryFn: () => getBiz() as unknown as Promise<Business | null>,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!business) return <SetupBusiness />;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Agenda — {business.name}</h1>
          <p className="text-xs text-muted-foreground">
            Link público: <a className="text-primary hover:underline" href={`/agenda/${business.slug}`} target="_blank" rel="noreferrer">/agenda/{business.slug}</a>
            <button
              className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
              onClick={() => { navigator.clipboard.writeText(`${location.origin}/agenda/${business.slug}`); toast.success("Link copiado"); }}
            ><Copy className="h-3 w-3" /> Copiar</button>
          </p>
        </div>
      </div>

      <HowItWorks />

      <Tabs defaultValue="calendar">

        <TabsList className="grid grid-cols-5 max-w-2xl">
          <TabsTrigger value="calendar"><Calendar className="h-4 w-4 mr-1" />Agenda</TabsTrigger>
          <TabsTrigger value="services"><Wrench className="h-4 w-4 mr-1" />Serviços</TabsTrigger>
          <TabsTrigger value="pros"><Users className="h-4 w-4 mr-1" />Equipe</TabsTrigger>
          <TabsTrigger value="reeng"><Sparkles className="h-4 w-4 mr-1" />Reengaja.</TabsTrigger>
          <TabsTrigger value="settings"><Clock className="h-4 w-4 mr-1" />Config</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4"><CalendarTab business={business} /></TabsContent>
        <TabsContent value="services" className="mt-4"><ServicesTab business={business} /></TabsContent>
        <TabsContent value="pros" className="mt-4"><ProfessionalsTab business={business} /></TabsContent>
        <TabsContent value="reeng" className="mt-4"><ReengagementTab business={business} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab business={business} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ===================== Setup =====================
function SetupBusiness() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertBusinessFn);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: (vars: { slug: string; name: string }) => upsert({ data: vars }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-business"] }); toast.success("Agenda criada!"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="p-6 max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Criar agenda</CardTitle>
          <CardDescription>Configure o link público que seus clientes vão usar pra marcar horário.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nome do negócio</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salão da Maria" />
          </div>
          <div>
            <Label>Slug (link)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="salao-da-maria" />
            <p className="text-xs text-muted-foreground mt-1">Será: /agenda/{slug || "..."}</p>
          </div>
          <Button className="w-full" disabled={m.isPending || !slug || !name} onClick={() => m.mutate({ slug, name })}>
            Criar agenda
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ===================== Calendar =====================
function CalendarTab({ business }: { business: Business }) {
  const list = useServerFn(listAppointmentsFn);
  const upd = useServerFn(updateAppointmentStatusFn);
  const qc = useQueryClient();
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const from = `${dateStr}T00:00:00`;
  const to = (() => { const d = new Date(dateStr); d.setDate(d.getDate() + 7); return `${d.toISOString().slice(0, 10)}T00:00:00`; })();

  const { data: appts = [] } = useQuery({
    queryKey: ["agenda-appts", business.id, dateStr],
    queryFn: () => list({ data: { business_id: business.id, from, to } }) as unknown as Promise<Array<{
      id: string; starts_at: string; ends_at: string; status: string; customer_name: string; customer_phone: string;
      agenda_services: { name: string; duration_min: number } | null;
      agenda_professionals: { name: string; color: string | null } | null;
    }>>,
  });

  const updMut = useMutation({
    mutationFn: (vars: { id: string; status: "confirmed" | "cancelled" | "done" | "no_show" }) => upd({ data: vars }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-appts"] }); toast.success("Atualizado"); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-xs">A partir de:</Label>
        <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="w-40" />
        <span className="text-xs text-muted-foreground">próximos 7 dias</span>
      </div>
      {appts.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum agendamento nesse período.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {appts.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                <div className="w-1 h-12 rounded" style={{ background: a.agenda_professionals?.color || "#888" }} />
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{a.customer_name} · {a.customer_phone}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {a.agenda_services?.name} · {a.agenda_professionals?.name}
                  </div>
                </div>
                <StatusBadge s={a.status} />
                <div className="flex gap-1">
                  {a.status !== "cancelled" && a.status !== "done" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updMut.mutate({ id: a.id, status: "done" })}>Realizado</Button>
                      <Button size="sm" variant="outline" onClick={() => updMut.mutate({ id: a.id, status: "no_show" })}>Faltou</Button>
                      <Button size="sm" variant="ghost" onClick={() => updMut.mutate({ id: a.id, status: "cancelled" })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-yellow-500/20 text-yellow-700" },
    confirmed_customer: { label: "Cliente confirmou", cls: "bg-blue-500/20 text-blue-700" },
    confirmed_pro: { label: "Profissional confirmou", cls: "bg-blue-500/20 text-blue-700" },
    confirmed: { label: "Confirmado", cls: "bg-emerald-500/20 text-emerald-700" },
    cancelled: { label: "Cancelado", cls: "bg-red-500/20 text-red-700" },
    no_show: { label: "Faltou", cls: "bg-red-500/20 text-red-700" },
    done: { label: "Realizado", cls: "bg-muted text-foreground" },
  };
  const m = map[s] ?? { label: s, cls: "bg-muted" };
  return <Badge variant="secondary" className={m.cls}>{m.label}</Badge>;
}

// ===================== Services =====================
function ServicesTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const list = useServerFn(listServicesFn);
  const ups = useServerFn(upsertServiceFn);
  const del = useServerFn(deleteServiceFn);
  const listPros = useServerFn(listProfessionalsFn);

  const { data: services = [] } = useQuery({
    queryKey: ["agenda-svcs", business.id],
    queryFn: () => list({ data: { business_id: business.id } }) as unknown as Promise<Array<{
      id: string; name: string; description: string | null; duration_min: number; price_cents: number; active: boolean;
      agenda_service_professionals: { professional_id: string }[];
    }>>,
  });
  const { data: pros = [] } = useQuery({
    queryKey: ["agenda-pros", business.id],
    queryFn: () => listPros({ data: { business_id: business.id } }) as unknown as Promise<Array<{ id: string; name: string }>>,
  });

  const [editing, setEditing] = useState<null | {
    id?: string; name: string; description: string; duration_min: number; price_cents: number; active: boolean; professional_ids: string[];
  }>(null);

  const mut = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => ups({ data: { ...v, business_id: business.id, description: v.description || null } }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-svcs"] }); setEditing(null); toast.success("Salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-svcs"] }); toast.success("Removido"); },
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({ name: "", description: "", duration_min: 30, price_cents: 0, active: true, professional_ids: [] })}>
        <Plus className="h-4 w-4 mr-1" />Novo serviço
      </Button>
      {services.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum serviço criado ainda.</CardContent></Card>
      ) : services.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.duration_min}min · R$ {(s.price_cents / 100).toFixed(2)} · {s.agenda_service_professionals.length} profissional(is)</div>
            </div>
            {!s.active && <Badge variant="secondary">Inativo</Badge>}
            <Button size="sm" variant="outline" onClick={() => setEditing({
              id: s.id, name: s.name, description: s.description ?? "",
              duration_min: s.duration_min, price_cents: s.price_cents, active: s.active,
              professional_ids: s.agenda_service_professionals.map((x) => x.professional_id),
            })}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover?")) delMut.mutate(s.id); }}><Trash2 className="h-3 w-3" /></Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Novo"} serviço</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Duração (min)</Label><Input type="number" value={editing.duration_min} onChange={(e) => setEditing({ ...editing, duration_min: parseInt(e.target.value) || 30 })} /></div>
                <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={editing.price_cents / 100} onChange={(e) => setEditing({ ...editing, price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} /></div>
              </div>
              <div>
                <Label>Profissionais que atendem</Label>
                <div className="space-y-1 mt-1 max-h-40 overflow-auto border rounded p-2">
                  {pros.length === 0 && <p className="text-xs text-muted-foreground">Cadastre profissionais primeiro.</p>}
                  {pros.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox"
                        checked={editing.professional_ids.includes(p.id)}
                        onChange={(e) => setEditing({
                          ...editing,
                          professional_ids: e.target.checked
                            ? [...editing.professional_ids, p.id]
                            : editing.professional_ids.filter((x) => x !== p.id),
                        })}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={mut.isPending} onClick={() => editing && mut.mutate(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== Professionals =====================
function ProfessionalsTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const list = useServerFn(listProfessionalsFn);
  const ups = useServerFn(upsertProfessionalFn);
  const del = useServerFn(deleteProfessionalFn);
  const listAv = useServerFn(listAvailabilityFn);
  const setAv = useServerFn(setAvailabilityFn);

  const { data: pros = [] } = useQuery({
    queryKey: ["agenda-pros", business.id],
    queryFn: () => list({ data: { business_id: business.id } }) as unknown as Promise<Array<{ id: string; name: string; phone: string | null; color: string | null; active: boolean; agenda_availability: { id: string }[] }>>,
  });


  const [editing, setEditing] = useState<null | { id?: string; name: string; phone: string; color: string; active: boolean }>(null);
  const [availPro, setAvailPro] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => ups({ data: { ...v, business_id: business.id, phone: v.phone || null, color: v.color || null } }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-pros"] }); setEditing(null); toast.success("Salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({ name: "", phone: "", color: "#6366f1", active: true })}><Plus className="h-4 w-4 mr-1" />Novo profissional</Button>
      {pros.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Cadastre o primeiro profissional e depois clique em <b>Horários</b> pra definir os dias e horas que ele atende.</CardContent></Card>
      )}
      {pros.map((p) => {
        const noHours = (p.agenda_availability?.length ?? 0) === 0;
        return (
        <Card key={p.id} className={noHours ? "border-amber-500/50" : undefined}>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="w-3 h-3 rounded-full" style={{ background: p.color || "#888" }} />
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium flex items-center gap-2">
                {p.name}
                {noHours && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />sem horários
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{p.phone || "sem WhatsApp"}</div>
            </div>
            {!p.active && <Badge variant="secondary">Inativo</Badge>}
            <Button size="sm" variant={noHours ? "default" : "outline"} onClick={() => setAvailPro(p.id)}>
              <Clock className="h-3 w-3 mr-1" />Horários
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing({ id: p.id, name: p.name, phone: p.phone ?? "", color: p.color ?? "#6366f1", active: p.active })}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover?")) del({ data: { id: p.id } }).then(() => qc.invalidateQueries({ queryKey: ["agenda-pros"] })); }}><Trash2 className="h-3 w-3" /></Button>
          </CardContent>
        </Card>
        );
      })}


      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Novo"} profissional</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>WhatsApp (recebe lembrete)</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="5511999999999" /></div>
              <div><Label>Cor</Label><Input type="color" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="h-10 w-20" /></div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={mut.isPending} onClick={() => editing && mut.mutate(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AvailabilityDialog
        professionalId={availPro}
        onClose={() => setAvailPro(null)}
        list={listAv}
        save={setAv}
      />
    </div>
  );
}

function AvailabilityDialog({ professionalId, onClose, list, save }: {
  professionalId: string | null;
  onClose: () => void;
  list: ReturnType<typeof useServerFn<typeof listAvailabilityFn>>;
  save: ReturnType<typeof useServerFn<typeof setAvailabilityFn>>;
}) {
  const qc = useQueryClient();
  const { data: windows = [] } = useQuery({
    queryKey: ["agenda-avail", professionalId],
    enabled: !!professionalId,
    queryFn: () => list({ data: { professional_id: professionalId! } }) as unknown as Promise<Array<{ id: string; weekday: number; start_time: string; end_time: string }>>,
  });

  // Local state: per-weekday list of windows
  type Win = { start: string; end: string };
  const [byDay, setByDay] = useState<Record<number, Win[]>>({});
  const key = windows.map((w) => `${w.weekday}-${w.start_time}-${w.end_time}`).join("|");
  useMemo(() => {
    const map: Record<number, Win[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const w of windows) {
      map[w.weekday] = map[w.weekday] ?? [];
      map[w.weekday].push({ start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5) });
    }
    setByDay(map);
  }, [key]);

  const saveMut = useMutation({
    mutationFn: () => {
      const flat: Array<{ weekday: number; start_time: string; end_time: string }> = [];
      for (const [wd, wins] of Object.entries(byDay)) {
        for (const w of wins) flat.push({ weekday: parseInt(wd), start_time: w.start, end_time: w.end });
      }
      return save({ data: { professional_id: professionalId!, windows: flat } }) as Promise<unknown>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda-avail"] });
      qc.invalidateQueries({ queryKey: ["agenda-pros"] });
      toast.success("Horários salvos");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Presets
  const applyPreset = (preset: "weekdays" | "weekdays-lunch" | "everyday" | "clear") => {
    const map: Record<number, Win[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (preset === "weekdays") {
      for (let d = 1; d <= 5; d++) map[d] = [{ start: "09:00", end: "18:00" }];
    } else if (preset === "weekdays-lunch") {
      for (let d = 1; d <= 5; d++) map[d] = [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "18:00" }];
    } else if (preset === "everyday") {
      for (let d = 0; d <= 6; d++) map[d] = [{ start: "09:00", end: "18:00" }];
    }
    setByDay(map);
  };

  const copyMonday = () => {
    const src = byDay[1] ?? [];
    const map = { ...byDay };
    for (let d = 2; d <= 5; d++) map[d] = src.map((w) => ({ ...w }));
    setByDay(map);
  };

  const toggleDay = (wd: number) => {
    const cur = byDay[wd] ?? [];
    setByDay({ ...byDay, [wd]: cur.length > 0 ? [] : [{ start: "09:00", end: "18:00" }] });
  };

  const updateWin = (wd: number, i: number, patch: Partial<Win>) => {
    const cur = [...(byDay[wd] ?? [])];
    cur[i] = { ...cur[i], ...patch };
    setByDay({ ...byDay, [wd]: cur });
  };

  const addWin = (wd: number) => {
    const cur = byDay[wd] ?? [];
    setByDay({ ...byDay, [wd]: [...cur, { start: "13:00", end: "18:00" }] });
  };

  const removeWin = (wd: number, i: number) => {
    const cur = [...(byDay[wd] ?? [])];
    cur.splice(i, 1);
    setByDay({ ...byDay, [wd]: cur });
  };

  return (
    <Dialog open={!!professionalId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Horários de atendimento</DialogTitle>
          <CardDescription>
            Marque os dias que esse profissional atende e defina o intervalo de horas. Você pode ter mais de uma janela por dia (ex: manhã e tarde, com almoço no meio).
          </CardDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 pb-2 border-b">
          <Button size="sm" variant="outline" onClick={() => applyPreset("weekdays")}>Seg–Sex 9h–18h</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("weekdays-lunch")}>Seg–Sex 9–12 / 13–18</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("everyday")}>Todo dia 9h–18h</Button>
          <Button size="sm" variant="outline" onClick={copyMonday}>Copiar segunda → seg-sex</Button>
          <Button size="sm" variant="ghost" onClick={() => applyPreset("clear")}>Limpar tudo</Button>
        </div>

        <div className="space-y-2 max-h-[440px] overflow-auto">
          {WEEKDAYS.map((day, wd) => {
            const wins = byDay[wd] ?? [];
            const active = wins.length > 0;
            return (
              <div key={wd} className={`p-2 rounded border ${active ? "bg-card" : "bg-muted/30"}`}>
                <div className="flex items-center gap-3">
                  <Switch checked={active} onCheckedChange={() => toggleDay(wd)} />
                  <span className={`font-medium w-14 ${active ? "" : "text-muted-foreground"}`}>{day}</span>
                  {!active && <span className="text-xs text-muted-foreground">Fechado</span>}
                  {active && (
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => addWin(wd)}>
                      <Plus className="h-3 w-3 mr-1" />Janela
                    </Button>
                  )}
                </div>
                {active && (
                  <div className="mt-2 space-y-1 pl-12">
                    {wins.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={w.start} onChange={(e) => updateWin(wd, i, { start: e.target.value })} className="w-28" />
                        <span className="text-muted-foreground">—</span>
                        <Input type="time" value={w.end} onChange={(e) => updateWin(wd, i, { end: e.target.value })} className="w-28" />
                        {wins.length > 1 && (
                          <Button size="sm" variant="ghost" onClick={() => removeWin(wd, i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvando…" : "Salvar horários"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== How it works =====================
function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
          <Info className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm flex-1">Como funciona a Agenda — leia antes de divulgar o link</span>
          <span className="text-xs text-muted-foreground">{open ? "ocultar" : "mostrar"}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p><b className="text-foreground">1. Equipe →</b> cadastre cada profissional que atende. Para cada um, clique no botão <b>Horários</b> e marque os dias e as horas em que ele atende (ex: Seg–Sex 9h–18h). <b>Sem horários definidos, ninguém consegue agendar com esse profissional.</b></p>
            <p><b className="text-foreground">2. Serviços →</b> cadastre o que você oferece (nome, duração em minutos, preço opcional) e marque quais profissionais executam cada serviço.</p>
            <p><b className="text-foreground">3. Config →</b> escolha o chip WhatsApp que vai enviar as confirmações e ajuste os lembretes (ex: 1440 = 24h antes, 120 = 2h antes do agendamento).</p>
            <p><b className="text-foreground">4. Divulgue o link →</b> compartilhe <code className="text-foreground">/agenda/seu-slug</code> com seus clientes. Eles escolhem serviço → profissional → data → horário, recebem confirmação no WhatsApp e o sistema impede agendamentos sobrepostos automaticamente.</p>
            <p><b className="text-foreground">5. Agenda →</b> acompanhe os próximos 7 dias, marque como <b>Realizado</b>, <b>Faltou</b> ou <b>Cancelar</b>.</p>
            <p><b className="text-foreground">6. Reengajamento →</b> dispare mensagens automáticas pra clientes que não agendam há X dias, com cupom opcional pra incentivar o retorno.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ===================== Reengagement =====================
function ReengagementTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const list = useServerFn(listReengagementFn);
  const ups = useServerFn(upsertReengagementFn);
  const del = useServerFn(deleteReengagementFn);

  const { data: camps = [] } = useQuery({
    queryKey: ["agenda-reeng", business.id],
    queryFn: () => list({ data: { business_id: business.id } }) as unknown as Promise<Array<{
      id: string; name: string; message_template: string; coupon_code: string | null;
      inactive_days: number; cadence: "every_7_days"|"every_15_days"|"every_30_days"; active: boolean; last_run_at: string | null;
    }>>,
  });

  const [editing, setEditing] = useState<null | { id?: string; name: string; message_template: string; coupon_code: string; inactive_days: number; cadence: "every_7_days"|"every_15_days"|"every_30_days"; active: boolean }>(null);

  const mut = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => ups({ data: { ...v, business_id: business.id, coupon_code: v.coupon_code || null } }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-reeng"] }); setEditing(null); toast.success("Salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing({ name: "", message_template: "Oi {nome}! Faz tempo que não te vejo. Use o cupom {cupom} e marque já: {link}", coupon_code: "", inactive_days: 30, cadence: "every_30_days", active: true })}>
        <Plus className="h-4 w-4 mr-1" />Nova campanha
      </Button>
      <p className="text-xs text-muted-foreground">
        Mensagens automáticas pra quem não agenda há X dias. Use variáveis: <code>{"{nome}"}</code>, <code>{"{cupom}"}</code>, <code>{"{link}"}</code>.
      </p>
      {camps.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium">{c.name} {!c.active && <Badge variant="secondary" className="ml-1">Pausada</Badge>}</div>
              <div className="text-xs text-muted-foreground">Inativos há {c.inactive_days}d · cadência {c.cadence.replace("every_", "").replace("_days", "d")} · cupom {c.coupon_code || "—"}</div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.message_template}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing({ id: c.id, name: c.name, message_template: c.message_template, coupon_code: c.coupon_code ?? "", inactive_days: c.inactive_days, cadence: c.cadence, active: c.active })}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remover?")) del({ data: { id: c.id } }).then(() => qc.invalidateQueries({ queryKey: ["agenda-reeng"] })); }}><Trash2 className="h-3 w-3" /></Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nova"} campanha de reengajamento</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome interno</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Mensagem</Label><Textarea rows={4} value={editing.message_template} onChange={(e) => setEditing({ ...editing, message_template: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Inativos há (dias)</Label><Input type="number" value={editing.inactive_days} onChange={(e) => setEditing({ ...editing, inactive_days: parseInt(e.target.value) || 30 })} /></div>
                <div>
                  <Label>Cadência</Label>
                  <Select value={editing.cadence} onValueChange={(v: "every_7_days"|"every_15_days"|"every_30_days") => setEditing({ ...editing, cadence: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="every_7_days">Semanal</SelectItem>
                      <SelectItem value="every_15_days">Quinzenal</SelectItem>
                      <SelectItem value="every_30_days">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Código de cupom (opcional)</Label><Input value={editing.coupon_code} onChange={(e) => setEditing({ ...editing, coupon_code: e.target.value })} placeholder="DESCONTO10" /></div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativa</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={mut.isPending} onClick={() => editing && mut.mutate(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================== Settings =====================
function SettingsTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const ups = useServerFn(upsertBusinessFn);
  const [form, setForm] = useState({
    name: business.name, slug: business.slug, about: business.about ?? "",
    timezone: business.timezone, default_instance_id: business.default_instance_id ?? "",
    confirm_offsets: business.confirm_offsets_minutes.join(","),
    notify_professional: business.notify_professional, primary_color: business.primary_color ?? "#6366f1",
    active: business.active,
  });

  const { data: instances = [] } = useQuery({
    queryKey: ["wa-instances"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_instances").select("id, instance_name, status");
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: () => ups({ data: {
      id: business.id, slug: form.slug, name: form.name, about: form.about || null,
      timezone: form.timezone, default_instance_id: form.default_instance_id || null,
      confirm_offsets_minutes: form.confirm_offsets.split(",").map((s) => parseInt(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
      notify_professional: form.notify_professional, primary_color: form.primary_color || null, active: form.active,
    } }) as Promise<unknown>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-business"] }); toast.success("Configurações salvas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
        </div>
        <div><Label>Descrição</Label><Textarea value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Fuso horário</Label><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
          <div>
            <Label>Chip WhatsApp pra envios</Label>
            <Select value={form.default_instance_id || "none"} onValueChange={(v) => setForm({ ...form, default_instance_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— escolher —</SelectItem>
                {instances.map((i) => <SelectItem key={i.id} value={i.id}>{i.instance_name} ({i.status})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Lembretes (minutos antes, separados por vírgula)</Label>
          <Input value={form.confirm_offsets} onChange={(e) => setForm({ ...form, confirm_offsets: e.target.value })} placeholder="1440, 120" />
          <p className="text-xs text-muted-foreground mt-1">Ex: 1440 = 24h antes, 120 = 2h antes.</p>
        </div>
        <div className="flex items-center gap-2"><Switch checked={form.notify_professional} onCheckedChange={(v) => setForm({ ...form, notify_professional: v })} /><Label>Notificar profissional também</Label></div>
        <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Link público ativo</Label></div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Salvar</Button>
      </CardContent>
    </Card>
  );
}
