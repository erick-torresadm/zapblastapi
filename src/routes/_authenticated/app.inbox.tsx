import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Send, Search, MessageCircle, UserPlus, CheckCircle2, Clock, MoreVertical, StickyNote, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { getConversationMessagesFn, sendChatMessageFn, listChatInstancesFn } from "@/lib/chat.functions";
import {
  listConversationsFn, listAgentsFn, myWorkspacesFn, assignConversationFn, claimConversationFn,
  setConversationStatusFn, listNotesFn, addNoteFn,
} from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/app/inbox")({ component: Inbox });

type Conv = {
  id: string; owner_user_id: string; instance_id: string | null; contact_phone: string;
  contact_name: string | null; assigned_agent_id: string | null;
  status: "open" | "pending" | "resolved"; last_message_at: string;
  last_message_text: string | null; last_message_direction: "in" | "out" | null;
  unread_count: number;
};
type Msg = {
  id: string; direction: "in" | "out"; text: string | null; created_at: string;
  status: string; read_at: string | null; instance_id: string | null; sent_by_agent_id: string | null;
};
type Agent = { id: string; agent_user_id: string; role: string; display_name: string | null; active: boolean };
type Workspace = { owner_user_id: string; role: string; display_name: string | null };
type Note = { id: string; author_user_id: string; text: string; created_at: string };

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

const statusColor: Record<string, string> = {
  open: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-muted text-muted-foreground border-border",
};
const statusLabel: Record<string, string> = { open: "Aberta", pending: "Pendente", resolved: "Resolvida" };

function Inbox() {
  const qc = useQueryClient();
  const convFn = useServerFn(listConversationsFn);
  const msgFn = useServerFn(getConversationMessagesFn);
  const sendFn = useServerFn(sendChatMessageFn);
  const instFn = useServerFn(listChatInstancesFn);
  const wsFn = useServerFn(myWorkspacesFn);
  const agentsFn = useServerFn(listAgentsFn);
  const assignFn = useServerFn(assignConversationFn);
  const claimFn = useServerFn(claimConversationFn);
  const statusFn = useServerFn(setConversationStatusFn);
  const notesFn = useServerFn(listNotesFn);
  const addNoteSf = useServerFn(addNoteFn);

  const [filter, setFilter] = useState<"all" | "mine" | "queue">("all");
  const [statusFilter, setStatusFilter] = useState<"open" | "pending" | "resolved" | "any">("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string>(""); // owner_user_id selecionado
  const [instanceId, setInstanceId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["my-workspaces"],
    queryFn: () => wsFn() as unknown as Promise<Workspace[]>,
  });

  useEffect(() => {
    if (workspaces.length && !workspace) {
      const own = workspaces.find((w) => w.role === "owner");
      setWorkspace((own ?? workspaces[0]).owner_user_id);
    }
  }, [workspaces, workspace]);

  const { data: convs = [] } = useQuery<Conv[]>({
    queryKey: ["crm-convs", workspace, filter, statusFilter],
    queryFn: () => convFn({ data: {
      workspace: workspace || undefined,
      status: statusFilter === "any" ? undefined : statusFilter,
      filter,
    } }) as unknown as Promise<Conv[]>,
    refetchInterval: 5000,
    enabled: !!workspace,
  });

  const { data: instances = [] } = useQuery<Array<{ id: string; instance_name: string; status: string }>>({
    queryKey: ["crm-instances", workspace],
    queryFn: () => instFn({ data: { workspace_owner: workspace } }) as unknown as Promise<Array<{ id: string; instance_name: string; status: string }>>,
    enabled: !!workspace,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["crm-agents", workspace],
    queryFn: () => agentsFn() as unknown as Promise<Agent[]>,
    enabled: !!workspace,
  });

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["crm-msgs", selectedId],
    queryFn: () => selectedId
      ? (msgFn({ data: { conversation_id: selectedId } }) as unknown as Promise<Msg[]>)
      : Promise.resolve([]),
    enabled: !!selectedId,
    refetchInterval: selectedId ? 3000 : false,
  });

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["crm-notes", selectedId],
    queryFn: () => selectedId
      ? (notesFn({ data: { conversation_id: selectedId } }) as unknown as Promise<Note[]>)
      : Promise.resolve([]),
    enabled: !!selectedId,
  });

  const current = convs.find((c) => c.id === selectedId);

  useEffect(() => {
    if (current?.instance_id && !instanceId) setInstanceId(current.instance_id);
  }, [current, instanceId]);

  useEffect(() => {
    if (!instanceId && instances.length) {
      const conn = instances.find((i) => i.status === "connected");
      if (conn) setInstanceId(conn.id);
    }
  }, [instances, instanceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedId]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return convs;
    return convs.filter((c) =>
      c.contact_phone.includes(s)
      || (c.contact_name ?? "").toLowerCase().includes(s)
      || (c.last_message_text ?? "").toLowerCase().includes(s),
    );
  }, [convs, search]);

  const agentMap = useMemo(() => {
    const m: Record<string, string> = {};
    agents.forEach((a) => { m[a.agent_user_id] = a.display_name ?? a.agent_user_id.slice(0, 8); });
    return m;
  }, [agents]);

  const invalidateConvLists = () => {
    qc.invalidateQueries({ queryKey: ["crm-convs"] });
  };

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: { conversation_id: selectedId!, text: draft.trim(), instance_id: instanceId || undefined } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["crm-msgs", selectedId] });
      invalidateConvLists();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (agent_user_id: string | null) =>
      assignFn({ data: { conversation_id: selectedId!, agent_user_id } }),
    onSuccess: () => { invalidateConvLists(); toast.success("Atribuição atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimMut = useMutation({
    mutationFn: () => claimFn({ data: { conversation_id: selectedId! } }),
    onSuccess: () => { invalidateConvLists(); toast.success("Conversa atribuída a você"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (status: "open" | "pending" | "resolved") =>
      statusFn({ data: { conversation_id: selectedId!, status } }),
    onSuccess: () => invalidateConvLists(),
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: () => addNoteSf({ data: { conversation_id: selectedId!, text: noteDraft.trim() } }),
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["crm-notes", selectedId] });
      toast.success("Nota adicionada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myRole = workspaces.find((w) => w.owner_user_id === workspace)?.role ?? "agent";
  const canAssignOthers = myRole === "owner" || myRole === "admin";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border bg-card">
      {/* Coluna esquerda */}
      <aside className="flex w-96 flex-col border-r">
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">CRM</h2>
            {workspaces.length > 1 && (
              <Select value={workspace} onValueChange={setWorkspace}>
                <SelectTrigger className="ml-auto h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.owner_user_id} value={w.owner_user_id}>
                      {w.display_name ?? w.owner_user_id.slice(0,8)} · {w.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "mine" | "queue")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="mine" className="text-xs">Minhas</TabsTrigger>
              <TabsTrigger value="queue" className="text-xs">Fila</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "open" | "pending" | "resolved" | "any")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Abertas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="resolved">Resolvidas</SelectItem>
              <SelectItem value="any">Todas</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="h-8 pl-8 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!filtered.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {filter === "queue" ? "Sem conversas na fila." : filter === "mine" ? "Você não tem conversas." : "Sem conversas."}
            </p>
          )}
          {filtered.map((c) => {
            const active = selectedId === c.id;
            const assignedName = c.assigned_agent_id ? agentMap[c.assigned_agent_id] ?? "—" : null;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-start gap-3 border-b p-3 text-left transition hover:bg-muted/50 ${active ? "bg-muted" : ""}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                  {(c.contact_name ?? c.contact_phone).slice(-2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.contact_name ?? fmtPhone(c.contact_phone)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.last_message_direction === "out" ? "↗ " : "↙ "}{c.last_message_text ?? "(sem texto)"}
                    </p>
                    {c.unread_count > 0 && (
                      <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">{c.unread_count}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className={`rounded border px-1.5 py-0 text-[9px] font-medium ${statusColor[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                    {assignedName ? (
                      <span className="truncate text-[10px] text-muted-foreground">👤 {assignedName}</span>
                    ) : (
                      <span className="text-[10px] font-medium text-warning">📥 na fila</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Painel direito */}
      <section className="flex flex-1 flex-col bg-muted/20">
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <InboxIcon className="h-10 w-10 opacity-40" />
            Selecione uma conversa.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b bg-card p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                {(current.contact_name ?? current.contact_phone).slice(-2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{current.contact_name ?? fmtPhone(current.contact_phone)}</div>
                <div className="font-mono text-xs text-muted-foreground">{current.contact_phone}</div>
              </div>

              <span className={`hidden md:inline rounded border px-2 py-1 text-[10px] font-medium ${statusColor[current.status]}`}>
                {statusLabel[current.status]}
              </span>

              {!current.assigned_agent_id ? (
                <Button size="sm" onClick={() => claimMut.mutate()}>
                  <UserPlus className="mr-1 h-3.5 w-3.5" /> Pegar
                </Button>
              ) : (
                <Badge variant="secondary" className="hidden md:inline">👤 {agentMap[current.assigned_agent_id] ?? "—"}</Badge>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => statusMut.mutate("open")}>
                    <Clock className="mr-2 h-4 w-4" /> Marcar como aberta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("pending")}>
                    <Clock className="mr-2 h-4 w-4" /> Marcar como pendente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("resolved")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Resolver
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Atribuir</DropdownMenuLabel>
                  {canAssignOthers ? (
                    <>
                      <DropdownMenuItem onClick={() => assignMut.mutate(null)}>↩ Devolver para a fila</DropdownMenuItem>
                      {agents.filter((a) => a.active).map((a) => (
                        <DropdownMenuItem key={a.id} onClick={() => assignMut.mutate(a.agent_user_id)}>
                          👤 {a.display_name ?? a.agent_user_id.slice(0,8)} <span className="ml-auto text-xs text-muted-foreground">{a.role}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : (
                    <DropdownMenuItem disabled>Sem permissão para transferir</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowNotes((s) => !s)}>
                    <StickyNote className="mr-2 h-4 w-4" /> {showNotes ? "Esconder notas" : "Mostrar notas"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex flex-1 flex-col">
                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.map((m) => {
                    const author = m.sent_by_agent_id ? agentMap[m.sent_by_agent_id] : null;
                    return (
                      <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          m.direction === "out" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card border"
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.text ?? "(sem texto)"}</p>
                          <div className={`mt-1 flex items-center gap-1 text-[10px] ${m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {author && <span>{author} ·</span>}
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!messages.length && (
                    <p className="py-12 text-center text-sm text-muted-foreground">Sem mensagens nessa conversa.</p>
                  )}
                </div>

                <footer className="border-t bg-card p-3">
                  <form onSubmit={(e) => { e.preventDefault(); if (draft.trim() && selectedId) sendMut.mutate(); }} className="flex items-center gap-2">
                    <Select value={instanceId} onValueChange={setInstanceId}>
                      <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Chip" /></SelectTrigger>
                      <SelectContent>
                        {instances.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.instance_name} {i.status === "connected" ? "🟢" : "⚪"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Digite uma mensagem…"
                      disabled={sendMut.isPending}
                    />
                    <Button type="submit" size="icon" disabled={!draft.trim() || !instanceId || sendMut.isPending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </footer>
              </div>

              {showNotes && (
                <aside className="flex w-72 flex-col border-l bg-card">
                  <div className="border-b p-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <StickyNote className="h-4 w-4 text-warning" /> Notas internas
                    </h3>
                    <p className="text-[10px] text-muted-foreground">Só a equipe vê. O contato não recebe.</p>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-3">
                    {notes.length === 0 && <p className="text-center text-xs text-muted-foreground">Sem notas.</p>}
                    {notes.map((n) => (
                      <div key={n.id} className="rounded bg-warning/10 border border-warning/30 p-2 text-xs">
                        <div className="mb-1 text-[10px] text-muted-foreground">
                          {agentMap[n.author_user_id] ?? "—"} · {new Date(n.created_at).toLocaleString("pt-BR")}
                        </div>
                        <p className="whitespace-pre-wrap">{n.text}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => { e.preventDefault(); if (noteDraft.trim()) noteMut.mutate(); }}
                    className="space-y-2 border-t p-3"
                  >
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Anotação interna…"
                      rows={2}
                      className="text-sm"
                    />
                    <Button type="submit" size="sm" className="w-full" disabled={!noteDraft.trim() || noteMut.isPending}>
                      Adicionar nota
                    </Button>
                  </form>
                </aside>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
