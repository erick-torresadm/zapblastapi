// Bolha de mensagem: texto, imagem, vídeo, áudio (PTT/normal), documento, sticker.
// Suporta reply (quoted), reações, estrelas, exclusão lógica, hover-actions.
import { useState } from "react";
import { Download, FileText, Play, Pause, Reply, Smile, Copy, Star, Trash2, MoreVertical, CheckCheck, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Msg = {
  id: string;
  direction: "in" | "out";
  text: string | null;
  caption?: string | null;
  created_at: string;
  status: string;
  read_at: string | null;
  sent_by_agent_id: string | null;
  media_type?: "image" | "video" | "audio" | "document" | "sticker" | null;
  media_url?: string | null;
  signed_url?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
  duration_seconds?: number | null;
  is_ptt?: boolean | null;
  reaction?: string | null;
  reactions?: Record<string, string> | null;
  starred?: boolean | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function fmtDuration(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60); const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtSize(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function AudioPlayer({ url, duration, ptt }: { url: string; duration?: number | null; ptt?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => typeof Audio !== "undefined" ? new Audio(url) : null);
  if (!audio) return null;
  audio.onended = () => setPlaying(false);
  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        type="button"
        onClick={() => {
          if (playing) { audio.pause(); setPlaying(false); }
          else { audio.play().catch(() => {}); setPlaying(true); }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="flex-1">
        <div className="flex h-6 items-end gap-[2px]">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i}
              className={`w-[2px] rounded-full ${playing ? "bg-primary" : "bg-muted-foreground/50"}`}
              style={{ height: `${20 + Math.sin(i * 0.7) * 60}%` }} />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-70">
          {ptt && <span>🎤</span>} <span>{fmtDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function QuotedMessage({ quoted }: { quoted: Msg }) {
  const text = quoted.deleted_at
    ? "Mensagem apagada"
    : quoted.text ?? quoted.caption ?? (
        quoted.media_type === "image" ? "📷 Imagem"
        : quoted.media_type === "video" ? "🎬 Vídeo"
        : quoted.media_type === "audio" ? "🎤 Áudio"
        : quoted.media_type === "document" ? "📎 Documento"
        : "Mensagem"
      );
  return (
    <div className="mb-1 rounded-lg border-l-4 bg-black/10 px-2 py-1 text-xs"
         style={{ borderColor: "var(--chat-quoted-border)" }}>
      <div className="font-medium opacity-80">{quoted.direction === "out" ? "Você" : "Contato"}</div>
      <div className="truncate opacity-70">{text}</div>
    </div>
  );
}

function ReactionsBar({ reactions, onClick }: { reactions: Record<string, string>; onClick?: () => void }) {
  const counts: Record<string, number> = {};
  Object.values(reactions).forEach((e) => { counts[e] = (counts[e] ?? 0) + 1; });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return (
    <button type="button" onClick={onClick}
      className="absolute -bottom-3 right-2 flex items-center gap-0.5 rounded-full border bg-popover px-1.5 py-0.5 text-xs shadow-sm hover:scale-105 transition">
      {entries.map(([e, n]) => (
        <span key={e} className="flex items-center gap-0.5">
          <span>{e}</span>
          {n > 1 && <span className="text-[9px] text-muted-foreground">{n}</span>}
        </span>
      ))}
    </button>
  );
}

function ReactionPicker({ onPick }: { onPick: (e: string | null) => void }) {
  return (
    <div className="flex gap-1 rounded-full border bg-popover p-1 shadow-md">
      {QUICK_REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)}
          className="text-lg hover:scale-125 transition">{e}</button>
      ))}
      <button type="button" onClick={() => onPick(null)}
        title="Remover reação"
        className="text-muted-foreground hover:text-foreground text-sm px-1">×</button>
    </div>
  );
}

export function MessageBubble({
  m, authorName, quoted, currentUserId, onImageClick, onReply, onReact, onCopy, onStar, onDelete,
}: {
  m: Msg;
  authorName?: string | null;
  quoted?: Msg | null;
  currentUserId?: string | null;
  onImageClick?: (url: string) => void;
  onReply?: (m: Msg) => void;
  onReact?: (m: Msg, emoji: string | null) => void;
  onCopy?: (m: Msg) => void;
  onStar?: (m: Msg, starred: boolean) => void;
  onDelete?: (m: Msg) => void;
}) {
  const url = m.signed_url ?? m.media_url ?? null;
  const isOut = m.direction === "out";
  const isSticker = m.media_type === "sticker";
  const [showPicker, setShowPicker] = useState(false);
  const reactions = m.reactions ?? {};
  const myReaction = currentUserId ? reactions[currentUserId] : undefined;

  if (m.deleted_at) {
    return (
      <div className={`bubble-row flex ${isOut ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-xs italic opacity-60 ${isOut ? "bubble-out" : "bubble-in"}`}>
          🚫 Mensagem apagada
        </div>
      </div>
    );
  }

  if (isSticker && url) {
    return (
      <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
        <img src={url} alt="sticker" className="h-32 w-32 object-contain" />
      </div>
    );
  }

  return (
    <div className={`bubble-row group relative flex ${isOut ? "justify-end" : "justify-start"} ${Object.keys(reactions).length ? "mb-3" : ""}`}>
      <div className={`relative max-w-[80%] sm:max-w-[70%] overflow-visible rounded-2xl px-1.5 py-1.5 text-sm shadow-sm ${
        isOut ? "rounded-br-sm bubble-out" : "rounded-bl-sm bubble-in"
      }`}>
        {/* Hover actions */}
        <div className={`bubble-actions absolute ${isOut ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"} top-1 hidden md:flex items-center gap-0.5`}>
          <button type="button" onClick={() => onReply?.(m)} title="Responder"
            className="rounded-full bg-popover border p-1 shadow hover:scale-105 transition"><Reply className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setShowPicker((s) => !s)} title="Reagir"
            className="rounded-full bg-popover border p-1 shadow hover:scale-105 transition"><Smile className="h-3.5 w-3.5" /></button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-full bg-popover border p-1 shadow hover:scale-105 transition">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOut ? "end" : "start"}>
              <DropdownMenuItem onClick={() => onCopy?.(m)}><Copy className="mr-2 h-4 w-4" /> Copiar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStar?.(m, !m.starred)}>
                <Star className={`mr-2 h-4 w-4 ${m.starred ? "fill-warning text-warning" : ""}`} />
                {m.starred ? "Desmarcar" : "Estrelar"}
              </DropdownMenuItem>
              {isOut && (
                <DropdownMenuItem onClick={() => onDelete?.(m)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Apagar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showPicker && (
          <div className={`absolute z-20 ${isOut ? "right-0" : "left-0"} -top-10`}>
            <ReactionPicker onPick={(e) => { onReact?.(m, e === myReaction ? null : e); setShowPicker(false); }} />
          </div>
        )}

        {quoted && <div className="px-1.5 pt-1"><QuotedMessage quoted={quoted} /></div>}

        {m.media_type === "image" && url && (
          <button type="button" onClick={() => onImageClick?.(url)}
            className="block max-h-80 overflow-hidden rounded-xl">
            <img src={url} alt={m.caption ?? ""} className="max-h-80 w-auto object-cover" />
          </button>
        )}
        {m.media_type === "video" && url && (
          <video src={url} controls className="max-h-80 max-w-full rounded-xl" />
        )}
        {m.media_type === "audio" && url && (
          <div className="px-2 py-1">
            <AudioPlayer url={url} duration={m.duration_seconds} ptt={!!m.is_ptt} />
          </div>
        )}
        {m.media_type === "document" && (
          <a href={url ?? "#"} target="_blank" rel="noreferrer"
            className={`flex items-center gap-2 rounded-xl border p-2 ${isOut ? "border-white/30 bg-white/10" : "border-border bg-muted/40"}`}>
            <FileText className="h-8 w-8 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{m.media_filename ?? "Documento"}</div>
              <div className="text-[10px] opacity-70">{fmtSize(m.media_size)}</div>
            </div>
            <Download className="h-4 w-4 opacity-80" />
          </a>
        )}

        {(m.text || m.caption) && (
          <p className="whitespace-pre-wrap break-words px-2 py-1">{m.text ?? m.caption}</p>
        )}

        <div className={`flex items-center gap-1 px-2 pt-0.5 text-[10px] ${isOut ? "opacity-70" : "text-muted-foreground"}`}>
          {m.starred && <Star className="h-3 w-3 fill-warning text-warning" />}
          {authorName && <span>{authorName} ·</span>}
          <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          {isOut && (
            <span className="ml-1">
              {m.status === "read"
                ? <CheckCheck className="inline h-3.5 w-3.5 tick-read" />
                : m.status === "delivered"
                  ? <CheckCheck className="inline h-3.5 w-3.5" />
                  : <Check className="inline h-3.5 w-3.5" />}
            </span>
          )}
        </div>

        <ReactionsBar reactions={reactions} onClick={() => setShowPicker((s) => !s)} />
      </div>
    </div>
  );
}

export type { Msg };
