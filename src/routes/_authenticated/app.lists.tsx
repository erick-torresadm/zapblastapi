import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone, parseCSV } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/app/lists")({ component: ListsPage });

function ListsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ name: string; contacts: { phone: string; variables: Record<string, string> }[] } | null>(null);

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => (await supabase.from("contact_lists").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const createList = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Sem prévia");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data: list, error } = await supabase.from("contact_lists").insert({
        user_id: user.id, name: preview.name, total_count: preview.contacts.length,
      }).select().single();
      if (error) throw error;
      // Insert contacts in chunks
      const chunk = 500;
      for (let i = 0; i < preview.contacts.length; i += chunk) {
        const slice = preview.contacts.slice(i, i + chunk).map((c) => ({
          user_id: user.id, list_id: list.id, phone: c.phone, variables: c.variables,
        }));
        const { error: ce } = await supabase.from("contacts").insert(slice);
        if (ce) throw ce;
      }
    },
    onSuccess: () => { toast.success("Lista criada"); setOpen(false); setPreview(null); qc.invalidateQueries({ queryKey: ["lists"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("contact_lists").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Lista removida"); qc.invalidateQueries({ queryKey: ["lists"] }); },
  });

  async function handleFile(file: File, listName: string) {
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (!headers.includes("phone") && !headers.includes("telefone") && !headers.includes("numero")) {
      toast.error("CSV precisa de uma coluna 'phone', 'telefone' ou 'numero'");
      return;
    }
    const phoneCol = headers.find((h) => ["phone","telefone","numero"].includes(h))!;
    const seen = new Set<string>();
    const contacts: { phone: string; variables: Record<string, string> }[] = [];
    for (const row of rows) {
      const n = normalizePhone(row[phoneCol]);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const variables: Record<string, string> = {};
      for (const h of headers) if (h !== phoneCol && row[h]) variables[h] = row[h];
      contacts.push({ phone: n, variables });
    }
    if (!contacts.length) { toast.error("Nenhum número válido encontrado"); return; }
    setPreview({ name: listName, contacts });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listas de contatos</h1>
          <p className="text-sm text-muted-foreground">Importe CSVs com seus contatos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />Baixar modelo CSV
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPreview(null); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova lista</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar lista CSV</DialogTitle>
              <DialogDescription>CSV com coluna "phone" (ou "telefone" / "numero") + colunas opcionais como "nome", "empresa" etc. para usar como variáveis.</DialogDescription>
            </DialogHeader>
            {!preview ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const file = fd.get("file") as File;
                  const name = String(fd.get("name"));
                  if (file && file.size > 0) handleFile(file, name);
                }}
                className="space-y-4"
              >
                <div><Label htmlFor="name">Nome da lista</Label><Input id="name" name="name" required /></div>
                <div><Label htmlFor="file">Arquivo CSV</Label><Input id="file" name="file" type="file" accept=".csv,text/csv" required /></div>
                <DialogFooter><Button type="submit">Analisar</Button></DialogFooter>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded border bg-muted/30 p-3 text-sm">
                  <p><strong>{preview.name}</strong> — {preview.contacts.length} contatos válidos</p>
                  <p className="mt-2 text-xs text-muted-foreground">Variáveis disponíveis: {Object.keys(preview.contacts[0]?.variables ?? {}).join(", ") || "(nenhuma)"}</p>
                </div>
                <div className="max-h-40 overflow-y-auto rounded border text-xs">
                  <table className="w-full">
                    <tbody>{preview.contacts.slice(0, 10).map((c, i) => (
                      <tr key={i} className="border-b"><td className="p-2 font-mono">{c.phone}</td><td className="p-2 text-muted-foreground">{Object.entries(c.variables).map(([k,v]) => `${k}=${v}`).join(", ")}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPreview(null)}>Voltar</Button>
                  <Button onClick={() => createList.mutate()} disabled={createList.isPending}>Salvar {preview.contacts.length} contatos</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>


      <Card>
        <CardHeader><CardTitle>Minhas listas</CardTitle></CardHeader>
        <CardContent>
          {!lists?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma lista ainda.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contatos</TableHead><TableHead>Criada em</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {lists.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell>{l.total_count}</TableCell>
                    <TableCell>{new Date(l.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="space-x-1">
                      <Button asChild variant="ghost" size="icon"><Link to="/app/lists/$id" params={{ id: l.id }}><Eye className="h-4 w-4" /></Link></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover lista?")) remove.mutate(l.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
