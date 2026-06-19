// Preview de mensagem citada acima do composer.
import { X, Reply } from "lucide-react";
import type { Msg } from "./MessageBubble";

export function ReplyPreview({ msg, onCancel }: { msg: Msg; onCancel: () => void }) {
  const text = msg.text ?? msg.caption ?? (
    msg.media_type === "image" ? "📷 Imagem"
    : msg.media_type === "video" ? "🎬 Vídeo"
    : msg.media_type === "audio" ? "🎤 Áudio"
    : msg.media_type === "document" ? "📎 Documento"
    : "Mensagem"
  );
  return (
    <div className="flex items-center gap-2 rounded-2xl border-l-4 bg-muted/50 px-3 py-2"
         style={{ borderLeftColor: "var(--chat-quoted-border)" }}>
      <Reply className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold text-primary">Respondendo {msg.direction === "out" ? "à sua mensagem" : "ao contato"}</div>
        <div className="truncate text-xs text-muted-foreground">{text}</div>
      </div>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
