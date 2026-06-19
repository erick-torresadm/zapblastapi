// Bolha de mensagem: texto, imagem, vídeo, áudio (PTT/normal), documento, sticker.
import { useState } from "react";
import { Download, FileText, Play, Pause } from "lucide-react";

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
  media_url?: string | null;          // pode ser path no storage OU URL externa
  signed_url?: string | null;          // resolvido no client
  media_mime?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
  duration_seconds?: number | null;
  is_ptt?: boolean | null;
  reaction?: string | null;
};

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

export function MessageBubble({ m, authorName, onImageClick }: {
  m: Msg; authorName?: string | null; onImageClick?: (url: string) => void;
}) {
  const url = m.signed_url ?? m.media_url ?? null;
  const isOut = m.direction === "out";
  const isSticker = m.media_type === "sticker";

  if (isSticker && url) {
    return (
      <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
        <img src={url} alt="sticker" className="h-32 w-32 object-contain" />
      </div>
    );
  }

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] sm:max-w-[70%] overflow-hidden rounded-2xl px-1.5 py-1.5 text-sm shadow-sm ${
        isOut ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card border"
      }`}>
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
            className={`flex items-center gap-2 rounded-xl border p-2 ${isOut ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-border bg-muted/40"}`}>
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

        <div className={`flex items-center gap-1 px-2 pt-0.5 text-[10px] ${isOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {authorName && <span>{authorName} ·</span>}
          <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          {isOut && (
            <span className="ml-1">
              {m.status === "read" ? "✓✓" : m.status === "delivered" ? "✓✓" : "✓"}
            </span>
          )}
          {m.reaction && <span className="ml-1 text-base">{m.reaction}</span>}
        </div>
      </div>
    </div>
  );
}

export type { Msg };
