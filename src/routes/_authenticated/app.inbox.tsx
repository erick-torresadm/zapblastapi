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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Send, Search, MessageCircle, UserPlus, CheckCircle2, Clock, MoreVertical, StickyNote,
  ArrowLeft, Inbox as InboxIcon, Paperclip, Image as ImgIcon, FileText, Smile, User2, Zap, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getConversationMessagesFn, sendChatMessageFn, listChatInstancesFn } from "@/lib/chat.functions";
import {
  listConversationsFn, listAgentsFn, myWorkspacesFn, assignConversationFn, claimConversationFn,
  setConversationStatusFn, listNotesFn, addNoteFn,
} from "@/lib/crm.functions";
import {
  sendChatMediaFn, signMediaUrlsFn, sendPresenceFn,
  listQuickRepliesFn, saveQuickReplyFn, deleteQuickReplyFn,
} from "@/lib/crm-media.functions";
import { MessageBubble, type Msg } from "@/components/crm/MessageBubble";
import { AudioRecorder } from "@/components/crm/AudioRecorder";
import { ContactPanel, type ContactConv } from "@/components/crm/ContactPanel";

export const Route = createFileRoute("/_authenticated/app/inbox")({ component: Inbox });

type Conv = ContactConv & {
  owner_user_id: string;
  instance_id: string | null;
  contact_jid: string | null;
  assigned_agent_id: string | null;
  status: "open" | "pending" | "resolved";
  last_message_text: string | null;
  last_message_direction: "in" | "out" | null;
  last_message_type: string | null;
  unread_count: number;
};
type Agent = { id: string; agent_user_id: string; role: string; display_name: string | null; active: boolean };
type Workspace = { owner_user_id: string; role: string; display_name: string | null };
type Note = { id: string; author_user_id: string; text: string; created_at: string };
type QR = { id: string; shortcut: string; title: string | null; text: string };

const EMOJIS = ["😀","😅","😂","🙂","😉","😍","🥰","😘","🤔","😎","😢","😭","🙏","👍","👎","👏","🙌","🔥","🎉","✨","💯","❤️","💙","💚","💛","🧡","💜","🖤","✅","❌","⚡","📌","📷","🎵","🎬","💬","📞","🛒","💰","🚀"];

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
function lastPreview(c: Conv) {
  if (c.last_message_text) return c.last_message_text;
  switch (c.last_message_type) {
    case "image": return "📷 Imagem";
    case "video": return "🎬 Vídeo";
    case "audio": return "🎤 Áudio";
    case "document": return "📎 Documento";
    case "sticker": return "🎟️ Figurinha";
    default: return "(sem texto)";
  }
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
  const sendMediaSf = useServerFn(sendChatMediaFn);
  const signFn = useServerFn(signMediaUrlsFn);
  const presFn = useServerFn(sendPresenceFn);
  const listQrFn = useServerFn(listQuickRepliesFn);
  const saveQrFn = useServerFn(saveQuickReplyFn);
  const delQrFn = useServerFn(deleteQuickReplyFn);

  const [filter, setFilter] = useState<"all" | "mine" | "queue">("all");
  const [statusFilter, setStatusFilter] = useState<"open" | "pending" | "resolved" | "any">("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string>("");
  const [instanceId, setInstanceId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showQRs, setShowQRs] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [showConvSearch, setShowConvSearch] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [signedMap, setSignedMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<number | null>(null);

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
    refetchInterval: 15000,
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
  });

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["crm-notes", selectedId],
    queryFn: () => selectedId
      ? (notesFn({ data: { conversation_id: selectedId } }) as unknown as Promise<Note[]>)
      : Promise.resolve([]),
    enabled: !!selectedId,
  });

  const { data: quickReplies = [] } = useQuery<QR[]>({
    queryKey: ["crm-qrs", workspace],
    queryFn: () => listQrFn({ data: { workspace: workspace || undefined } }) as unknown as Promise<QR[]>,
    enabled: !!workspace,
  });

  // Realtime: chat_messages + crm_conversations
  useEffect(() => {
    if (!workspace) return;
    const ch = supabase
      .channel(`crm-${workspace}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversations", filter: `owner_user_id=eq.${workspace}` },
        () => qc.invalidateQueries({ queryKey: ["crm-convs"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `user_id=eq.${workspace}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["crm-convs"] });
          const m: any = payload.new;
          if (selectedId) qc.invalidateQueries({ queryKey: ["crm-msgs", selectedId] });
          if (m.direction === "in") {
            try { new Audio("/notify.mp3").play().catch(() => {}); } catch {}
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspace, selectedId, qc]);

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

  // Resolve signed URLs para mídias
  useEffect(() => {
    const paths = messages
      .filter((m) => m.media_url && !m.media_url.startsWith("http") && !signedMap[m.media_url])
      .map((m) => m.media_url!) as string[];
    if (!paths.length) return;
    signFn({ data: { paths } }).then((map) => setSignedMap((prev) => ({ ...prev, ...map }))).catch(() => {});
  }, [messages, signFn, signedMap]);

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

  const filteredMessages = useMemo(() => {
    if (!convSearch.trim()) return messages;
    const s = convSearch.toLowerCase();
    return messages.filter((m) =>
      (m.text ?? "").toLowerCase().includes(s) || (m.caption ?? "").toLowerCase().includes(s));
  }, [messages, convSearch]);

  const invalidateConvLists = () => qc.invalidateQueries({ queryKey: ["crm-convs"] });

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

  // --- Upload + envio de mídia ---
  async function uploadAndSend(file: File, kindOverride?: "image" | "video" | "audio" | "document" | "sticker", extra?: { is_ptt?: boolean; duration_seconds?: number; mimeOverride?: string }) {
    if (!selectedId || !current) return;
    const mime = extra?.mimeOverride ?? file.type ?? "application/octet-stream";
    const kind = kindOverride ?? (
      mime.startsWith("image/") ? (mime.includes("webp") ? "image" : "image")
      : mime.startsWith("video/") ? "video"
      : mime.startsWith("audio/") ? "audio"
      : "document"
    );
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || `arquivo-${Date.now()}`;
    const path = `${current.owner_user_id}/${current.contact_phone}/out-${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("crm-media").upload(path, file, {
      contentType: mime, upsert: false,
    });
    if (upErr) { toast.error("Falha no upload: " + upErr.message); return; }
    try {
      await sendMediaSf({ data: {
        conversation_id: selectedId,
        storage_path: path,
        kind,
        mime,
        filename: safeName,
        size: file.size,
        caption: draft.trim() || undefined,
        duration_seconds: extra?.duration_seconds,
        is_ptt: extra?.is_ptt,
        instance_id: instanceId || undefined,
      } });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["crm-msgs", selectedId] });
      invalidateConvLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    }
  }

  function onPickFile(kind?: "image" | "video" | "audio" | "document") {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.accept = kind === "image" ? "image/*"
      : kind === "video" ? "video/*"
      : kind === "audio" ? "audio/*"
      : kind === "document" ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
      : "*/*";
    input.dataset.kind = kind ?? "";
    input.click();
  }

  // typing indicator
  function pingTyping() {
    if (!selectedId) return;
    if (typingTimerRef.current) return;
    presFn({ data: { conversation_id: selectedId, presence: "composing" } }).catch(() => {});
    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null;
    }, 3000);
  }

  // Inserir resposta rápida
  function insertQuickReply(qr: QR) {
    setDraft((d) => (d ? `${d} ${qr.text}` : qr.text));
    setShowQRs(false);
  }

  // Detecta "/" no draft pra abrir QRs
  useEffect(() => {
    if (draft.trim().startsWith("/") && !showQRs && quickReplies.length) setShowQRs(true);
  }, [draft, showQRs, quickReplies.length]);

  const myRole = workspaces.find((w) => w.owner_user_id === workspace)?.role ?? "agent";
  const canAssignOthers = myRole === "owner" || myRole === "admin";

  const messagesWithSigned: Msg[] = messages.map((m) => ({
    ...m,
    signed_url: m.media_url ? (m.media_url.startsWith("http") ? m.media_url : signedMap[m.media_url] ?? null) : null,
  }));
  const filteredWithSigned = filteredMessages.map((m) => ({
    ...m,
    signed_url: m.media_url ? (m.media_url.startsWith("http") ? m.media_url : signedMap[m.media_url] ?? null) : null,
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-3xl border bg-card">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const kind = (fileInputRef.current?.dataset.kind || undefined) as any;
          uploadAndSend(f, kind);
        }}
      />

      {/* Lightbox de imagem */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Visualização</DialogTitle></DialogHeader>
          {lightbox && <img src={lightbox} alt="" className="max-h-[70vh] w-auto mx-auto" />}
        </DialogContent>
      </Dialog>

      {/* Lista de conversas */}
      <aside className={`flex w-full flex-col border-r md:w-96 md:shrink-0 ${selectedId ? "hidden md:flex" : "flex"}`}>
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
                {c.contact_avatar_url ? (
                  <img src={c.contact_avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                    {(c.contact_name ?? c.contact_phone).slice(-2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.contact_name ?? fmtPhone(c.contact_phone)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.last_message_direction === "out" ? "↗ " : "↙ "}{lastPreview(c)}
                    </p>
                    {c.unread_count > 0 && (
                      <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">{c.unread_count}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className={`rounded-full border px-1.5 py-0 text-[9px] font-medium ${statusColor[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                    {assignedName ? (
                      <span className="truncate text-[10px] text-muted-foreground">👤 {assignedName}</span>
                    ) : (
                      <span className="text-[10px] font-medium text-warning">📥 na fila</span>
                    )}
                    {c.tags?.length > 0 && (
                      <span className="truncate text-[10px] text-primary">🏷️ {c.tags.slice(0, 2).join(", ")}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Painel direito */}
      <section className={`flex flex-1 flex-col bg-muted/20 ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <InboxIcon className="h-10 w-10 opacity-40" />
            Selecione uma conversa.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b bg-card p-3 sm:gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:hidden" onClick={() => setSelectedId(null)} aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {current.contact_avatar_url ? (
                <img src={current.contact_avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-xs font-bold text-primary-foreground">
                  {(current.contact_name ?? current.contact_phone).slice(-2)}
                </div>
              )}
              <button className="min-w-0 flex-1 text-left" onClick={() => setShowContact((s) => !s)}>
                <div className="truncate text-sm font-medium">{current.contact_name ?? fmtPhone(current.contact_phone)}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {current.presence === "composing" ? <span className="text-success">digitando…</span>
                    : current.presence === "recording" ? <span className="text-success">gravando áudio…</span>
                    : current.contact_phone}
                </div>
              </button>

              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowConvSearch((s) => !s)} title="Buscar na conversa">
                <Search className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowContact((s) => !s)} title="Perfil do contato">
                <User2 className="h-4 w-4" />
              </Button>

              <span className={`hidden md:inline rounded-full border px-2 py-1 text-[10px] font-medium ${statusColor[current.status]}`}>
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
                  <DropdownMenuItem onClick={() => statusMut.mutate("open")}><Clock className="mr-2 h-4 w-4" /> Marcar como aberta</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("pending")}><Clock className="mr-2 h-4 w-4" /> Marcar como pendente</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("resolved")}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolver</DropdownMenuItem>
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

            {showConvSearch && (
              <div className="border-b bg-card p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={convSearch} onChange={(e) => setConvSearch(e.target.value)} placeholder="Buscar nesta conversa…" className="h-8 pl-7 pr-8 text-xs" />
                  <button onClick={() => { setConvSearch(""); setShowConvSearch(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden">
              <div className="flex flex-1 flex-col">
                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                  {filteredWithSigned.map((m) => (
                    <MessageBubble key={m.id} m={m}
                      authorName={m.sent_by_agent_id ? agentMap[m.sent_by_agent_id] : null}
                      onImageClick={(u) => setLightbox(u)} />
                  ))}
                  {!filteredWithSigned.length && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      {convSearch ? "Nada encontrado." : "Sem mensagens nessa conversa."}
                    </p>
                  )}
                </div>

                {/* Composer */}
                <footer className="border-t bg-card p-3 space-y-2">
                  {showQRs && quickReplies.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-2xl border bg-popover p-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span>Respostas rápidas</span>
                        <button onClick={() => setShowQRs(false)}><X className="h-3 w-3" /></button>
                      </div>
                      {quickReplies
                        .filter((qr) => draft.trim().startsWith("/") ? qr.shortcut.includes(draft.trim().slice(1)) : true)
                        .map((qr) => (
                          <button key={qr.id} onClick={() => insertQuickReply(qr)}
                            className="block w-full rounded-lg p-1.5 text-left text-xs hover:bg-muted">
                            <span className="font-mono text-primary">/{qr.shortcut}</span>
                            {qr.title && <span className="ml-1 font-medium">— {qr.title}</span>}
                            <p className="truncate text-muted-foreground">{qr.text}</p>
                          </button>
                        ))}
                    </div>
                  )}
                  {showEmoji && (
                    <div className="flex flex-wrap gap-1 rounded-2xl border bg-popover p-2 max-h-32 overflow-y-auto">
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => { setDraft((d) => d + e); }} className="text-xl hover:scale-125 transition">{e}</button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={(e) => { e.preventDefault(); if (draft.trim() && selectedId) sendMut.mutate(); }} className="flex items-end gap-2">
                    <Select value={instanceId} onValueChange={setInstanceId}>
                      <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue placeholder="Chip" /></SelectTrigger>
                      <SelectContent>
                        {instances.map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.instance_name} {i.status === "connected" ? "🟢" : "⚪"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" title="Anexar"><Paperclip className="h-5 w-5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => onPickFile("image")}><ImgIcon className="mr-2 h-4 w-4" /> Imagem</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPickFile("video")}><ImgIcon className="mr-2 h-4 w-4" /> Vídeo</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPickFile("document")}><FileText className="mr-2 h-4 w-4" /> Documento</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button type="button" variant="ghost" size="icon" onClick={() => setShowEmoji((s) => !s)} title="Emoji">
                      <Smile className="h-5 w-5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setShowQRs((s) => !s)} title="Respostas rápidas">
                      <Zap className="h-5 w-5" />
                    </Button>

                    <Textarea
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); pingTyping(); }}
                      placeholder="Digite uma mensagem… (use / para atalhos)"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && selectedId) sendMut.mutate(); }
                      }}
                      className="min-h-9 resize-none rounded-2xl"
                      disabled={sendMut.isPending}
                    />

                    <AudioRecorder
                      disabled={!instanceId}
                      onSend={async (blob, dur, mime) => {
                        const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
                        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
                        await uploadAndSend(file, "audio", { is_ptt: true, duration_seconds: dur, mimeOverride: mime });
                      }}
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
                    <h3 className="text-sm font-semibold flex items-center gap-2"><StickyNote className="h-4 w-4 text-warning" /> Notas internas</h3>
                    <p className="text-[10px] text-muted-foreground">Só a equipe vê. O contato não recebe.</p>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-3">
                    {notes.length === 0 && <p className="text-center text-xs text-muted-foreground">Sem notas.</p>}
                    {notes.map((n) => (
                      <div key={n.id} className="rounded-2xl bg-warning/10 border border-warning/30 p-2 text-xs">
                        <div className="mb-1 text-[10px] text-muted-foreground">
                          {agentMap[n.author_user_id] ?? "—"} · {new Date(n.created_at).toLocaleString("pt-BR")}
                        </div>
                        <p className="whitespace-pre-wrap">{n.text}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); if (noteDraft.trim()) noteMut.mutate(); }} className="space-y-2 border-t p-3">
                    <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Anotação interna…" rows={2} className="text-sm" />
                    <Button type="submit" size="sm" className="w-full" disabled={!noteDraft.trim() || noteMut.isPending}>Adicionar nota</Button>
                  </form>
                </aside>
              )}

              {showContact && current && (
                <ContactPanel conv={current} onClose={() => setShowContact(false)} />
              )}
            </div>
          </>
        )}
      </section>

      {/* Gerenciador de respostas rápidas (admin) */}
      {canAssignOthers && (
        <QuickReplyManager
          workspace={workspace}
          quickReplies={quickReplies}
          onSave={(d) => saveQrFn({ data: { ...d, workspace } })}
          onDelete={(id) => delQrFn({ data: { id } })}
          onChanged={() => qc.invalidateQueries({ queryKey: ["crm-qrs"] })}
        />
      )}
    </div>
  );
}

function QuickReplyManager({ workspace: _w, quickReplies, onSave, onDelete, onChanged }: {
  workspace: string;
  quickReplies: QR[];
  onSave: (d: { id?: string; shortcut: string; title?: string; text: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QR | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (editing) {
      setShortcut(editing.shortcut); setTitle(editing.title ?? ""); setText(editing.text);
    } else { setShortcut(""); setTitle(""); setText(""); }
  }, [editing]);

  async function save() {
    if (!shortcut.trim() || !text.trim()) return;
    try {
      await onSave({ id: editing?.id, shortcut: shortcut.trim(), title: title.trim() || undefined, text });
      onChanged(); setEditing(null); setShortcut(""); setTitle(""); setText("");
      toast.success("Salvo");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 hidden md:flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition" title="Respostas rápidas">
        <Zap className="h-5 w-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Respostas rápidas</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Atalhos da workspace</p>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border p-2">
                {quickReplies.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Nenhuma resposta rápida ainda.</p>}
                {quickReplies.map((qr) => (
                  <div key={qr.id} className="flex items-start gap-2 rounded-xl p-2 hover:bg-muted">
                    <button className="flex-1 text-left text-xs" onClick={() => setEditing(qr)}>
                      <span className="font-mono text-primary">/{qr.shortcut}</span>
                      {qr.title && <span className="ml-1 font-medium">— {qr.title}</span>}
                      <p className="truncate text-muted-foreground">{qr.text}</p>
                    </button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { await onDelete(qr.id); onChanged(); }}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{editing ? "Editar" : "Novo atalho"}</p>
              <Input value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))} placeholder="atalho (ex: oi)" className="font-mono text-xs" />
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="título (opcional)" />
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="texto da resposta…" rows={6} />
              <div className="flex gap-2">
                <Button onClick={save} className="flex-1">{editing ? "Salvar" : "Criar"}</Button>
                {editing && <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
