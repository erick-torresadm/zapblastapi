import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/lists/$id")({ component: ListDetail });

function ListDetail() {
  const { id } = Route.useParams();

  const { data: list } = useQuery({
    queryKey: ["list", id],
    queryFn: async () => (await supabase.from("contact_lists").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: contacts } = useQuery({
    queryKey: ["list-contacts", id],
    queryFn: async () => (await supabase.from("contacts").select("*").eq("list_id", id).order("created_at").limit(500)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/app/lists"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">{list?.name ?? "Lista"}</h1>
          <p className="text-sm text-muted-foreground">{list?.total_count ?? 0} contatos</p>
        </div>
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
