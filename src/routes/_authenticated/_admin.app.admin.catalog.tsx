import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Gate de admin já aplicado pelo layout _admin/route.tsx
export const Route = createFileRoute("/_authenticated/_admin/app/admin/catalog")({
  component: AdminCatalogPage,
});

type CatalogItem = {
  id?: string;
  name: string;
  description: string;
  price_cents: number;
  provider_cost_cents: number;
  provider: "mock" | "sms_activate" | "fivesim" | "smspool";
  provider_service_code: string;
  country_code: string;
  ttl_minutes: number;
  active: boolean;
  sort_order: number;
};

const EMPTY: CatalogItem = {
  name: "", description: "", price_cents: 990, provider_cost_cents: 400,
  provider: "mock", provider_service_code: "wa", country_code: "br",
  ttl_minutes: 20, active: true, sort_order: 99,
};

function AdminCatalogPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem>(EMPTY);

  const { data: items } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: async () => (await supabase.from("chip_catalog").select("*").order("sort_order")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (item: CatalogItem) => {
      const { id, ...rest } = item;
      if (id) {
        const { error } = await supabase.from("chip_catalog").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chip_catalog").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-catalog"] }); toast.success("Salvo"); setOpen(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("chip_catalog").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-catalog"] }); toast.success("Excluído"); },
    onError: (e) => toast.error((e as Error).message),
  });

  function openNew() { setEditing(EMPTY); setOpen(true); }
  function openEdit(it: typeof EMPTY & { id: string }) { setEditing(it); setOpen(true); }

  const margin = editing.price_cents - editing.provider_cost_cents;
  const marginPct = editing.provider_cost_cents > 0 ? Math.round((margin / editing.provider_cost_cents) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin · Catálogo</h1>
          <p className="text-muted-foreground">Gerencie os produtos vendidos no marketplace.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo produto</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Descrição</Label><Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Preço de venda (centavos)</Label><Input type="number" value={editing.price_cents} onChange={(e) => setEditing({ ...editing, price_cents: +e.target.value })} /></div>
                <div><Label>Custo provedor (centavos)</Label><Input type="number" value={editing.provider_cost_cents} onChange={(e) => setEditing({ ...editing, provider_cost_cents: +e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Margem: R$ {(margin / 100).toFixed(2)} ({marginPct}%)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Provedor</Label>
                  <Select value={editing.provider} onValueChange={(v) => setEditing({ ...editing, provider: v as CatalogItem["provider"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mock">Mock (DEV)</SelectItem>
                      <SelectItem value="sms_activate">SMS-Activate</SelectItem>
                      <SelectItem value="fivesim">5sim</SelectItem>
                      <SelectItem value="smspool">SMSPool</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Service code</Label><Input value={editing.provider_service_code} onChange={(e) => setEditing({ ...editing, provider_service_code: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>País</Label><Input value={editing.country_code} onChange={(e) => setEditing({ ...editing, country_code: e.target.value })} /></div>
                <div><Label>TTL (min)</Label><Input type="number" value={editing.ttl_minutes} onChange={(e) => setEditing({ ...editing, ttl_minutes: +e.target.value })} /></div>
                <div><Label>Ordem</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: +e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate(editing)} disabled={save.isPending}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Provedor</TableHead><TableHead>Preço</TableHead><TableHead>Custo</TableHead><TableHead>Margem</TableHead><TableHead>Ativo</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(items ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell><code className="text-xs">{i.provider}</code></TableCell>
                  <TableCell>R$ {(i.price_cents / 100).toFixed(2)}</TableCell>
                  <TableCell>R$ {(i.provider_cost_cents / 100).toFixed(2)}</TableCell>
                  <TableCell>R$ {((i.price_cents - i.provider_cost_cents) / 100).toFixed(2)}</TableCell>
                  <TableCell>{i.active ? "✅" : "❌"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit({ ...i, description: i.description ?? "" })}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir?")) del.mutate(i.id); }}><Trash2 className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
