import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { verifyContactsWhatsappFn } from "@/lib/contacts.functions";
import { formatPhone } from "@/lib/format-instance";

export const Route = createFileRoute("/_authenticated/app/lists/$id")({ component: ListDetail });

function ListDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const verify = useServerFn(verifyContactsWhatsappFn);
  const [open, setOpen] = useState(false);
  const [instanceId, setInstanceId] = useState("");

  const { data: list } = useQuery({
    queryKey: ["list", id],
    queryFn: async () => (await supabase.from("contact_lists").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: contacts } = useQuery({
    queryKey: ["list-contacts", id],
    queryFn: async () => (await supabase.from("contacts").select("*").eq("list_id", id).order("created_at").limit(500)).data ?? [],
  });

  const { data: chips } = useQuery({
    queryKey: ["instances-connected-for-verify"],
    queryFn: async () =>
      (await supabase.from("whatsapp_instances").select("id, instance_name, phone_number, status").eq("status", "connected")).data ?? [],
  });

  const runVerify = useMutation({
    mutationFn: async () => verify({ data: { list_id: id, instance_id: instanceId } }),
    onSuccess: (r) => {
      toast.success(`${r.removed} sem WhatsApp removidos • ${r.valid} válidos de ${r.checked}`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["list", id] });
      qc.invalidateQueries({ queryKey: ["list-contacts", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/app/lists"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{list?.name ?? "Lista"}</h1>
          <p className="text-sm text-muted-foreground">{list?.total_count ?? 0} contatos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><ShieldCheck className="mr-2 h-4 w-4" />Verificar WhatsApp</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Verificar números no WhatsApp</DialogTitle>
              <DialogDescription>
                Consulta cada número via Evolution e <strong>remove</strong> os que não têm WhatsApp. Pode demorar em listas grandes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Chip a usar</Label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger><SelectValue placeholder="Selecione um chip conectado" /></SelectTrigger>
                <SelectContent>
                  {chips?.length ? chips.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.instance_name}</SelectItem>
                  )) : <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum chip conectado</div>}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={!instanceId || runVerify.isPending} onClick={() => runVerify.mutate()}>
                {runVerify.isPending ? "Verificando..." : "Verificar e remover inválidos"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Contatos (até 500 primeiros)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Telefone</TableHead><TableHead>Variáveis</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {contacts?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Object.entries((c.variables ?? {}) as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </TableCell>
                  <TableCell>{c.opted_out ? <span className="text-destructive">Opt-out</span> : "Ativo"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
