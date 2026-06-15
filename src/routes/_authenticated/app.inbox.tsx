import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/inbox")({ component: Inbox });

function Inbox() {
  const { data: messages } = useQuery({
    queryKey: ["inbox"],
    queryFn: async () =>
      (await supabase.from("incoming_messages").select("*").order("received_at", { ascending: false }).limit(200)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Respostas recebidas</h1>
        <p className="text-sm text-muted-foreground">Últimas 200 mensagens recebidas via webhook</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Caixa de entrada</CardTitle></CardHeader>
        <CardContent>
          {!messages?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="rounded border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{m.from_phone}</span>
                    <span>{new Date(m.received_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-sm">{m.message_text ?? "(sem texto)"}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
