// CRM estilo WhatsApp Web — lista de conversas, chat, painel do contato.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Send, Search, MessageCircle, UserPlus, CheckCircle2, Clock, MoreVertical, StickyNote,
  ArrowLeft, Paperclip, Image as ImgIcon, FileText, Smile, User2, Zap, X,
  Pin, PinOff, Archive, BellOff, Bell, Filter, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getConversationMessagesFn, sendChatMessageFn, listChatInstancesFn } from "@/lib/chat.functions";
import {
  listConversationsFn, listAgentsFn, myWorkspacesFn, assignConversationFn, claimConversationFn,
  setConversationStatusFn, listNotesFn, addNoteFn,
  togglePinConversationFn, toggleArchiveConversationFn, toggleMuteConversationFn,
  reactToMessageFn, starMessageFn, deleteMessageFn,
} from "@/lib/crm.functions";
import {
  sendChatMediaFn, signMediaUrlsFn, signAvatarsFn, sendPresenceFn,
  listQuickRepliesFn, saveQuickReplyFn, deleteQuickReplyFn,
} from "@/lib/crm-media.functions";
import { syncInstanceContactsFn } from "@/lib/crm-profile.functions";
import { MessageBubble, type Msg } from "@/components/crm/MessageBubble";
import { AudioRecorder } from "@/components/crm/AudioRecorder";
import { ContactPanel, type ContactConv } from "@/components/crm/ContactPanel";
import { DateSeparator } from "@/components/crm/DateSeparator";
import { MediaPreviewDialog } from "@/components/crm/MediaPreviewDialog";
import { ReplyPreview } from "@/components/crm/ReplyPreview";
import { EmptyChatState } from "@/components/crm/EmptyChatState";
import { Avatar } from "@/components/crm/Avatar";
import { formatPhone as fmtInstancePhone } from "@/lib/format-instance";
import { formatPhone, displayName, isPhoneResolved } from "@/lib/crm-phone";



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
  pinned_at: string | null;
  archived_at: string | null;
  muted_until: string | null;
  last_seen_at: string | null;
  is_resolved: boolean;
  contact_avatar_path: string | null;
  snoozed_until: string | null;
  label_ids: string[];
  chat_type: string | null;
};
type Agent = { id: string; agent_user_id: string; role: string; display_name: string | null; active: boolean };
type Workspace = { owner_user_id: string; role: string; display_name: string | null };
type Note = { id: string; author_user_id: string; text: string; created_at: string };
type QR = { id: string; shortcut: string; title: string | null; text: string };

const EMOJIS = ["😀","😅","😂","🙂","😉","😍","🥰","😘","🤔","😎","😢","😭","🙏","👍","👎","👏","🙌","🔥","🎉","✨","💯","❤️","💙","💚","💛","🧡","💜","🖤","✅","❌","⚡","📌","📷","🎵","🎬","💬","📞","🛒","💰","🚀"];

type FilterKind = "all" | "unread" | "mine" | "queue" | "favorites" | "archived";

function fmtPhone(p: string) {
  return formatPhone(p);
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
function sameDay(a: string, b: string) {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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
  const signAvatarsSf = useServerFn(signAvatarsFn);
  const presFn = useServerFn(sendPresenceFn);
  const listQrFn = useServerFn(listQuickRepliesFn);
  const saveQrFn = useServerFn(saveQuickReplyFn);
  const delQrFn = useServerFn(deleteQuickReplyFn);
  const pinFn = useServerFn(togglePinConversationFn);
  const archiveFn = useServerFn(toggleArchiveConversationFn);
  const muteFn = useServerFn(toggleMuteConversationFn);
  const reactFn = useServerFn(reactToMessageFn);
  const starFn = useServerFn(starMessageFn);
  const delMsgFn = useServerFn(deleteMessageFn);


  const [filter, setFilter] = useState<FilterKind>("all");
  const [statusFilter, setStatusFilter] = useState<"open" | "pending" | "resolved" | "any">("any");
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
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)); }, []);

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
    queryKey: ["crm-convs", workspace, statusFilter],
    queryFn: () => convFn({ data: {
      workspace: workspace || undefined,
      status: statusFilter === "any" ? undefined : statusFilter,
      filter: "all",
    } }) as unknown as Promise<Conv[]>,
    refetchInterval: 15000,
    enabled: !!workspace,
  });

  const { data: instances = [] } = useQuery<Array<{ id: string; instance_name: string; phone_number: string | null; status: string }>>({
    queryKey: ["crm-instances", workspace],
    queryFn: () => instFn({ data: { workspace_owner: workspace } }) as unknown as Promise<Array<{ id: string; instance_name: string; phone_number: string | null; status: string }>>,
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

  // Realtime
  useEffect(() => {
    if (!workspace) return;
    const ch = supabase
      .channel(`crm-${workspace}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversations", filter: `owner_user_id=eq.${workspace}` },
        () => qc.invalidateQueries({ queryKey: ["crm-convs"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `user_id=eq.${workspace}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["crm-convs"] });
          const m: any = payload.new;
          if (selectedId) qc.invalidateQueries({ queryKey: ["crm-msgs", selectedId] });
          if (payload.eventType === "INSERT" && m?.direction === "in") {
            try { new Audio("/notify.mp3").play().catch(() => {}); } catch { /* ignore */ }
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

  useEffect(() => {
    const paths = messages
      .filter((m) => m.media_url && !m.media_url.startsWith("http") && !signedMap[m.media_url])
      .map((m) => m.media_url!) as string[];
    if (!paths.length) return;
    signFn({ data: { paths, bucket: "crm-media" } }).then((map) => setSignedMap((prev) => ({ ...prev, ...map }))).catch(() => {});
  }, [messages, signFn, signedMap]);

  // Assina avatares (bucket crm-avatars) das conversas visíveis
  useEffect(() => {
    const paths = convs
      .map((c) => c.contact_avatar_path)
      .filter((p): p is string => !!p && !avatarMap[p]);
    if (!paths.length) return;
    signAvatarsSf({ data: { paths } })
      .then((map) => setAvatarMap((prev) => ({ ...prev, ...map })))
      .catch(() => {});
  }, [convs, signAvatarsSf, avatarMap]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedId]);

  // Reset reply quando troca de conversa
  useEffect(() => { setReplyTo(null); setShowConvSearch(false); setConvSearch(""); }, [selectedId]);

  // Esc fecha conversa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (replyTo) setReplyTo(null);
        else if (pendingFile) setPendingFile(null);
        else if (showContact) setShowContact(false);
        else if (showNotes) setShowNotes(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replyTo, pendingFile, showContact, showNotes]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return convs.filter((c) => {
      // Filtro de visibilidade
      if (filter === "archived") { if (!c.archived_at) return false; }
      else { if (c.archived_at) return false; }
      if (filter === "unread" && c.unread_count <= 0) return false;
      if (filter === "mine" && c.assigned_agent_id !== currentUserId) return false;
      if (filter === "queue" && c.assigned_agent_id) return false;
      if (filter === "favorites" && !c.pinned_at) return false;
      if (s) {
        const blob = `${c.contact_phone} ${c.contact_name ?? ""} ${c.last_message_text ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [convs, search, filter, currentUserId]);

  const pinned = filtered.filter((c) => c.pinned_at);
  const rest = filtered.filter((c) => !c.pinned_at);

  const totalUnread = convs.reduce((n, c) => n + (c.archived_at ? 0 : c.unread_count), 0);

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

  const msgById = useMemo(() => {
    const m: Record<string, Msg> = {};
    messages.forEach((x) => { m[x.id] = x; });
    return m;
  }, [messages]);

  const invalidateConvLists = () => qc.invalidateQueries({ queryKey: ["crm-convs"] });
  const invalidateMsgs = () => selectedId && qc.invalidateQueries({ queryKey: ["crm-msgs", selectedId] });

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: {
      conversation_id: selectedId!,
      text: draft.trim(),
      instance_id: instanceId || undefined,
      reply_to_id: replyTo?.id,
    } }),
    onSuccess: () => { setDraft(""); setReplyTo(null); invalidateMsgs(); invalidateConvLists(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncContactsSf = useServerFn(syncInstanceContactsFn);
  const syncContactsMut = useMutation({
    mutationFn: async () => {
      const connected = (instances ?? []).filter((i) => i.status === "connected");
      if (!connected.length) throw new Error("Nenhuma instância conectada para sincronizar");
      let totalResolved = 0;
      let totalMerged = 0;
      let totalLid = 0;
      for (const inst of connected) {
        try {
          const r = await syncContactsSf({ data: { instance_id: inst.id } }) as any;
          totalResolved += r?.conversations_resolved ?? 0;
          totalMerged += r?.conversations_merged ?? 0;
          totalLid += r?.lid_mapped ?? 0;
        } catch (e) {
          console.warn("[sync]", inst.instance_name, (e as Error).message);
        }
      }
      return { totalResolved, totalMerged, totalLid };
    },
    onSuccess: (r) => {
      invalidateConvLists();
      toast.success(
        `Sincronização concluída — ${r.totalResolved} resolvidas, ${r.totalMerged} mescladas, ${r.totalLid} contatos mapeados`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-sync ao abrir a primeira vez se houver conversas em "Identificando…"
  const autoSyncRef = useRef(false);
  useEffect(() => {
    if (autoSyncRef.current) return;
    if (!instances?.length || !workspace) return;
    const pending = (conversations ?? []).some((c: any) =>
      !c.contact_phone || /^[0-9]{15,}$/.test(c.contact_phone) || (c.contact_jid ?? "").endsWith("@lid"),
    );
    if (!pending) return;
    autoSyncRef.current = true;
    syncContactsMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, workspace, conversations]);

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

  async function uploadAndSend(file: File, kindOverride?: "image" | "video" | "audio" | "document" | "sticker", extra?: { is_ptt?: boolean; duration_seconds?: number; mimeOverride?: string; caption?: string }) {
    if (!selectedId || !current) return;
    const mime = extra?.mimeOverride ?? file.type ?? "application/octet-stream";
    const kind = kindOverride ?? (
      mime.startsWith("image/") ? "image"
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
        caption: extra?.caption ?? undefined,
        duration_seconds: extra?.duration_seconds,
        is_ptt: extra?.is_ptt,
        instance_id: instanceId || undefined,
      } });
      invalidateMsgs(); invalidateConvLists();
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

  // Drag-and-drop
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && selectedId) setPendingFile(f);
  }

  // Paste image
  useEffect(() => {
    if (!selectedId) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith("image/"));
      if (item) {
        const f = item.getAsFile();
        if (f) setPendingFile(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedId]);

  function pingTyping() {
    if (!selectedId) return;
    if (typingTimerRef.current) return;
    presFn({ data: { conversation_id: selectedId, presence: "composing" } }).catch(() => {});
    typingTimerRef.current = window.setTimeout(() => { typingTimerRef.current = null; }, 3000);
  }

  function insertQuickReply(qr: QR) {
    setDraft((d) => (d ? `${d} ${qr.text}` : qr.text));
    setShowQRs(false);
  }

  useEffect(() => {
    if (draft.trim().startsWith("/") && !showQRs && quickReplies.length) setShowQRs(true);
  }, [draft, showQRs, quickReplies.length]);

  const myRole = workspaces.find((w) => w.owner_user_id === workspace)?.role ?? "agent";
  const canAssignOthers = myRole === "owner" || myRole === "admin";

  const messagesWithSigned: Msg[] = useMemo(() => filteredMessages.map((m) => ({
    ...m,
    signed_url: m.media_url ? (m.media_url.startsWith("http") ? m.media_url : signedMap[m.media_url] ?? null) : null,
  })), [filteredMessages, signedMap]);

  function isMuted(c: Conv) {
    return c.muted_until && new Date(c.muted_until).getTime() > Date.now();
  }

  // ---- Bubble actions ----
  const onReact = async (m: Msg, emoji: string | null) => {
    try { await reactFn({ data: { message_id: m.id, emoji } }); invalidateMsgs(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };
  const onCopy = (m: Msg) => {
    const t = m.text ?? m.caption ?? "";
    if (!t) return;
    navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));
  };
  const onStar = async (m: Msg, starred: boolean) => {
    try { await starFn({ data: { message_id: m.id, starred } }); invalidateMsgs(); toast.success(starred ? "Estrelada" : "Removida"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };
  const onDeleteMsg = async (m: Msg) => {
    if (!confirm("Apagar essa mensagem para você?")) return;
    try { await delMsgFn({ data: { message_id: m.id } }); invalidateMsgs(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };

  // ---- Conversation actions ----
  async function togglePin(c: Conv) {
    await pinFn({ data: { conversation_id: c.id, pinned: !c.pinned_at } });
    invalidateConvLists();
  }
  async function toggleArchive(c: Conv) {
    await archiveFn({ data: { conversation_id: c.id, archived: !c.archived_at } });
    invalidateConvLists();
    if (selectedId === c.id) setSelectedId(null);
    toast.success(c.archived_at ? "Desarquivada" : "Arquivada");
  }
  async function toggleMute(c: Conv) {
    const until = isMuted(c) ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await muteFn({ data: { conversation_id: c.id, muted_until: until } });
    invalidateConvLists();
    toast.success(until ? "Silenciado por 8h" : "Som ativado");
  }

  const filterChips: Array<{ id: FilterKind; label: string; icon?: ReactNode }> = [
    { id: "all", label: "Todas" },
    { id: "unread", label: `Não lidas${totalUnread ? ` · ${totalUnread}` : ""}` },
    { id: "mine", label: "Minhas" },
    { id: "queue", label: "Fila" },
    { id: "favorites", label: "Fixadas", icon: <Pin className="h-3 w-3" /> },
    { id: "archived", label: "Arquivadas", icon: <Archive className="h-3 w-3" /> },
  ];

  function avatarUrlFor(c: Conv): string | null {
    if (c.contact_avatar_path && avatarMap[c.contact_avatar_path]) return avatarMap[c.contact_avatar_path];
    if (c.contact_avatar_url) return c.contact_avatar_url;
    return null;
  }

  function renderConvRow(c: Conv) {
    const active = selectedId === c.id;
    const assignedName = c.assigned_agent_id ? agentMap[c.assigned_agent_id] ?? "—" : null;
    const muted = isMuted(c);
    const resolved = c.is_resolved && isPhoneResolved(c.contact_phone);
    return (
      <div key={c.id} className="group relative">
        <button
          onClick={() => setSelectedId(c.id)}
          className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left transition hover:bg-muted/50 ${active ? "bg-muted" : ""}`}
        >
          {active && <span className="absolute left-0 top-0 h-full w-1 bg-primary" />}
          <Avatar name={c.contact_name} phone={c.contact_phone} url={avatarUrlFor(c)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">
                {resolved ? displayName(c.contact_name, c.contact_phone) : (c.contact_name ?? "Identificando…")}
              </span>
              <span className={`shrink-0 text-[10px] ${c.unread_count > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {fmtTime(c.last_message_at)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">
                {c.last_message_direction === "out" ? "↗ " : "↙ "}{lastPreview(c)}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                {muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                {c.pinned_at && <Pin className="h-3 w-3 text-muted-foreground" />}
                {c.unread_count > 0 && (
                  <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">{c.unread_count}</Badge>
                )}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1 flex-wrap">
              <span className={`rounded-full border px-1.5 py-0 text-[9px] font-medium ${statusColor[c.status]}`}>
                {statusLabel[c.status]}
              </span>
              {!resolved && (
                <span className="rounded-full border border-warning/40 bg-warning/15 text-warning px-1.5 py-0 text-[9px] font-medium animate-pulse">
                  identificando…
                </span>
              )}
              {assignedName ? (
                <span className="truncate text-[10px] text-muted-foreground">👤 {assignedName}</span>
              ) : (
                <span className="text-[10px] font-medium text-warning">📥 fila</span>
              )}
            </div>

          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="absolute right-2 top-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded-full bg-card border shadow-sm">
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => togglePin(c)}>
              {c.pinned_at ? <><PinOff className="mr-2 h-4 w-4" /> Desafixar</> : <><Pin className="mr-2 h-4 w-4" /> Fixar</>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleMute(c)}>
              {muted ? <><Bell className="mr-2 h-4 w-4" /> Tirar do silêncio</> : <><BellOff className="mr-2 h-4 w-4" /> Silenciar 8h</>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleArchive(c)}>
              <Archive className="mr-2 h-4 w-4" /> {c.archived_at ? "Desarquivar" : "Arquivar"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-3xl border bg-card">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setPendingFile(f);
        }}
      />

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Visualização</DialogTitle></DialogHeader>
          {lightbox && <img src={lightbox} alt="" className="max-h-[70vh] w-auto mx-auto" />}
        </DialogContent>
      </Dialog>

      {/* Media preview */}
      <MediaPreviewDialog
        file={pendingFile}
        onCancel={() => setPendingFile(null)}
        onSend={async (caption) => {
          const f = pendingFile; setPendingFile(null);
          if (f) await uploadAndSend(f, undefined, { caption });
        }}
      />

      {/* Lista de conversas */}
      <aside className={`flex w-full flex-col border-r md:w-[360px] md:shrink-0 ${selectedId ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">CRM</h2>
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

          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa ou mensagem…" className="h-9 pl-8 text-sm rounded-full" />
          </div>

          <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin">
            {filterChips.map((fc) => (
              <button
                key={fc.id}
                onClick={() => setFilter(fc.id)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium border transition ${
                  filter === fc.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                }`}
              >
                {fc.icon}
                {fc.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "open" | "pending" | "resolved" | "any")}>
              <SelectTrigger className="h-7 text-[11px] border-none bg-transparent shadow-none px-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Todos os status</SelectItem>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="resolved">Resolvidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!filtered.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {filter === "queue" ? "Sem conversas na fila." :
               filter === "archived" ? "Nenhuma arquivada." :
               filter === "unread" ? "Tudo lido por aqui ✨" :
               filter === "favorites" ? "Fixe conversas pra elas aparecerem aqui." :
               "Sem conversas ainda."}
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                <Pin className="inline h-3 w-3 mr-1" /> Fixadas
              </div>
              {pinned.map(renderConvRow)}
            </>
          )}
          {rest.length > 0 && pinned.length > 0 && (
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">
              Todas
            </div>
          )}
          {rest.map(renderConvRow)}
        </div>
      </aside>

      {/* Painel direito */}
      <section
        className={`flex flex-1 flex-col chat-wallpaper relative ${selectedId ? "flex" : "hidden md:flex"}`}
        onDragOver={(e) => { if (selectedId) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/20 border-4 border-dashed border-primary pointer-events-none">
            <div className="rounded-2xl bg-card px-6 py-4 text-center shadow-elegant">
              <Paperclip className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-2 font-semibold">Solte o arquivo aqui</p>
            </div>
          </div>
        )}

        {!current ? (
          <EmptyChatState />
        ) : (
          <>
            <header className="flex items-center gap-2 border-b bg-card/95 backdrop-blur p-3 sm:gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:hidden" onClick={() => setSelectedId(null)} aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar
                name={current.contact_name}
                phone={current.contact_phone}
                url={avatarUrlFor(current)}
                size="md"
              />
              <button className="min-w-0 flex-1 text-left" onClick={() => setShowContact((s) => !s)}>
                <div className="truncate text-sm font-semibold flex items-center gap-2">
                  {current.is_resolved && isPhoneResolved(current.contact_phone)
                    ? displayName(current.contact_name, current.contact_phone)
                    : (current.contact_name ?? "Identificando contato…")}
                  {!current.is_resolved && (
                    <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-warning/15 text-warning border border-warning/30 font-normal animate-pulse">
                      sincronizando
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {current.presence === "composing" ? <span className="text-success">digitando…</span>
                    : current.presence === "recording" ? <span className="text-success">gravando áudio…</span>

                    : fmtPhone(current.contact_phone)}
                </div>
              </button>

              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowConvSearch((s) => !s)} title="Buscar na conversa">
                <Search className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePin(current)} title={current.pinned_at ? "Desafixar" : "Fixar"}>
                {current.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleArchive(current)} title="Arquivar">
                <Archive className="h-4 w-4" />
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
                  <DropdownMenuItem onClick={() => statusMut.mutate("open")}><Clock className="mr-2 h-4 w-4" /> Aberta</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("pending")}><Clock className="mr-2 h-4 w-4" /> Pendente</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => statusMut.mutate("resolved")}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolvida</DropdownMenuItem>
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
                  <DropdownMenuItem onClick={() => toggleMute(current)}>
                    {isMuted(current) ? <><Bell className="mr-2 h-4 w-4" /> Ativar som</> : <><BellOff className="mr-2 h-4 w-4" /> Silenciar 8h</>}
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
                <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
                  {messagesWithSigned.map((m, i) => {
                    const prev = messagesWithSigned[i - 1];
                    const showDate = !prev || !sameDay(prev.created_at, m.created_at);
                    const quoted = m.reply_to_id ? msgById[m.reply_to_id] : null;
                    return (
                      <div key={m.id}>
                        {showDate && <DateSeparator iso={m.created_at} />}
                        <MessageBubble
                          m={m}
                          quoted={quoted}
                          currentUserId={currentUserId}
                          authorName={m.sent_by_agent_id ? agentMap[m.sent_by_agent_id] : null}
                          onImageClick={(u) => setLightbox(u)}
                          onReply={(x) => setReplyTo(x)}
                          onReact={onReact}
                          onCopy={onCopy}
                          onStar={onStar}
                          onDelete={onDeleteMsg}
                        />
                      </div>
                    );
                  })}
                  {!messagesWithSigned.length && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      {convSearch ? "Nada encontrado." : "Sem mensagens nessa conversa."}
                    </p>
                  )}
                </div>

                {/* Composer */}
                <footer className="border-t bg-card/95 backdrop-blur p-3 space-y-2">
                  {replyTo && <ReplyPreview msg={replyTo} onCancel={() => setReplyTo(null)} />}

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
                      <SelectTrigger className="h-9 w-[220px] text-xs"><SelectValue placeholder="Chip" /></SelectTrigger>
                      <SelectContent>
                        {instances.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            <span className="flex items-center gap-1.5">
                              <span>{i.status === "connected" ? "🟢" : "⚪"}</span>
                              <span className="font-medium">{i.instance_name}</span>
                              <span className="text-muted-foreground text-xs">{fmtInstancePhone(i.phone_number)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button type="button" variant="ghost" size="icon" onClick={() => setShowEmoji((s) => !s)} title="Emoji">
                      <Smile className="h-5 w-5" />
                    </Button>

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

                    <Button type="button" variant="ghost" size="icon" onClick={() => setShowQRs((s) => !s)} title="Respostas rápidas">
                      <Zap className="h-5 w-5" />
                    </Button>

                    <Textarea
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); pingTyping(); }}
                      placeholder={replyTo ? "Responder…" : "Digite uma mensagem… (use / para atalhos, arraste arquivo, cole imagem)"}
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

  async function remove(id: string) {
    if (!confirm("Apagar essa resposta rápida?")) return;
    try { await onDelete(id); onChanged(); toast.success("Apagada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
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
                  <div key={qr.id} className="group flex items-start gap-1 rounded-lg p-1.5 hover:bg-muted">
                    <button className="flex-1 text-left text-xs" onClick={() => setEditing(qr)}>
                      <span className="font-mono text-primary">/{qr.shortcut}</span>
                      {qr.title && <span className="ml-1 font-medium">— {qr.title}</span>}
                      <p className="truncate text-muted-foreground">{qr.text}</p>
                    </button>
                    <button onClick={() => remove(qr.id)} className="opacity-0 group-hover:opacity-100 text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => setEditing(null)}>+ Nova</Button>
            </div>
            <div className="space-y-2">
              <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="atalho (ex: ola)" className="h-8 font-mono text-sm" />
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="h-8 text-sm" />
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem…" rows={6} className="text-sm" />
              <Button onClick={save} className="w-full" disabled={!shortcut.trim() || !text.trim()}>
                {editing ? "Atualizar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
