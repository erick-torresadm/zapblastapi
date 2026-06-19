// Preview de mídia antes do envio com legenda.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Send, FileText, X } from "lucide-react";

export function MediaPreviewDialog({
  file, onCancel, onSend,
}: {
  file: File | null;
  onCancel: () => void;
  onSend: (caption: string) => void;
}) {
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setUrl(null); setCaption(""); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!file) return null;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Enviar {isImage ? "imagem" : isVideo ? "vídeo" : "arquivo"}</span>
            <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-4 w-4" /></Button>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {isImage && url && <img src={url} alt="" className="max-h-[50vh] rounded-xl" />}
          {isVideo && url && <video src={url} controls className="max-h-[50vh] rounded-xl" />}
          {!isImage && !isVideo && (
            <div className="flex items-center gap-3 rounded-xl border p-4 w-full">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">{file.name}</div>
                <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
            </div>
          )}
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Adicionar legenda (opcional)…"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSend(caption); } }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onSend(caption)}><Send className="h-4 w-4 mr-2" /> Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
