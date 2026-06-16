import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Search, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listConversationsFn, getConversationMessagesFn, sendChatMessageFn, listChatInstancesFn,
} from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/app/inbox")({ component: Inbox });

type Conv = {
  phone: string; name: string | null; last_text: string | null; last_at: string;
  last_direction: "in" | "out"; unread: number; instance_id: string | null;
};
type Msg = {
  id: string; direction: "in" | "out"; text: string | null; created_at: string;
  status: string; read_at: string | null; instance_id: string | null;
};

function fmtPhone(p: string) {
  const m = p.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : p;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const md = new Date(d); md.setHours(0,0,0,0);
  if (md.getTime() === today.getTime()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Inbox() {
  const qc = useQueryClient();
  const convFn = useServerFn(listConversationsFn);
  const msgFn = useServerFn(getConversationMessagesFn);
  const sendFn = useServerFn(sendChatMessageFn);
  const instFn = useServerFn(listChatInstancesFn);

  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [instanceId, setInstanceId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: convs = [] } = useQuery<Conv[]>({
    queryKey: ["chat-convs"],
    queryFn: () => convFn() as unknown as Promise<Conv[]>,
    refetchInterval: 5000,
  });
  const { data: instances = [] } = useQuery<Array<{ id: string; instance_name: string; status: string }>>({
    queryKey: ["chat-instances"],
    queryFn: () => instFn() as unknown as Promise<Array<{ id: string; instance_name: string; status: string }>>,
  });
  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["chat-msgs", selected],
    queryFn: () => selected ? (msgFn({ data: { phone: selected } }) as unknown as Promise<Msg[]>) : Promise.resolve([]),
    enabled: !!selected,
    refetchInterval: selected ? 3000 : false,
  });


  useEffect(() => {
    if (instances.length && !instanceId) {
      const conn = instances.find((i) => i.status === "connected");
      setInstanceId(conn?.id ?? instances[0].id);
    }
  }, [instances, instanceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selected]);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase().trim();
    if (!f) return convs;
    return convs.filter((c) =>
      c.phone.includes(f) || (c.name ?? "").toLowerCase().includes(f) || (c.last_text ?? "").toLowerCase().includes(f),
    );
  }, [convs, filter]);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!selected || !draft.trim() || !instanceId) return;
      return sendFn({ data: { phone: selected, text: draft.trim(), instance_id: instanceId } });
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["chat-msgs", selected] });
      qc.invalidateQueries({ queryKey: ["chat-convs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = convs.find((c) => c.phone === selected);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border bg-card">
      {/* Lista de conversas */}
      <aside className="flex w-80 flex-col border-r">
        <div className="border-b p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Conversas</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" className="pl-8" />
          </div>
          <Select value={instanceId} onValueChange={setInstanceId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chip para enviar" /></SelectTrigger>
            <SelectContent>
              {instances.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.instance_name} {i.status === "connected" ? "🟢" : "⚪"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!filtered.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">Sem conversas.</p>
          )}
          {filtered.map((c) => {
            const active = selected === c.phone;
            return (
              <button
                key={c.phone}
                onClick={() => setSelected(c.phone)}
                className={`flex w-full items-start gap-3 border-b p-3 text-left transition hover:bg-muted/50 ${active ? "bg-muted" : ""}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                  {(c.name ?? c.phone).slice(-2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name ?? fmtPhone(c.phone)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.last_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.last_direction === "out" ? "Você: " : ""}{c.last_text ?? "(sem texto)"}
                    </p>
                    {c.unread > 0 && (
                      <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">{c.unread}</Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Painel da conversa */}
      <section className="flex flex-1 flex-col bg-muted/20">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa para começar.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b bg-card p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                {(current?.name ?? selected).slice(-2)}
              </div>
              <div>
                <div className="text-sm font-medium">{current?.name ?? fmtPhone(selected)}</div>
                <div className="text-xs text-muted-foreground font-mono">{selected}</div>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    m.direction === "out"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card border"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{m.text ?? "(sem texto)"}</p>
                    <div className={`mt-1 text-[10px] ${m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {!messages.length && (
                <p className="py-12 text-center text-sm text-muted-foreground">Sem mensagens nessa conversa.</p>
              )}
            </div>

            <footer className="border-t bg-card p-3">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMut.mutate(); }}
                className="flex items-center gap-2"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Digite uma mensagem…"
                  disabled={!instanceId || sendMut.isPending}
                />
                <Button type="submit" size="icon" disabled={!draft.trim() || !instanceId || sendMut.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              {!instanceId && (
                <p className="mt-1 text-[11px] text-destructive">Selecione um chip conectado para enviar.</p>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
