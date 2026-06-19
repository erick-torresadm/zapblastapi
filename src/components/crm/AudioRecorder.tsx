// Gravador de áudio (MediaRecorder) para enviar como nota de voz (PTT).
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AudioRecorder({ onSend, disabled }: {
  onSend: (blob: Blob, durationSec: number, mime: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [mime, setMime] = useState("audio/webm");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const supported = preferred.find((m) => (typeof MediaRecorder !== "undefined") && MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
      setMime(supported);
      const rec = new MediaRecorder(stream, { mimeType: supported });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: supported });
        setBlob(b);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    } catch (e) {
      alert("Não consegui acessar o microfone. Permita o uso e tente de novo.");
    }
  }

  function stop() {
    recRef.current?.stop();
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    setRecording(false);
  }

  function discard() { setBlob(null); setElapsed(0); }

  async function send() {
    if (!blob) return;
    await onSend(blob, elapsed, mime);
    setBlob(null); setElapsed(0);
  }

  if (blob) {
    return (
      <div className="flex items-center gap-2 rounded-full border bg-muted px-2 py-1">
        <audio src={URL.createObjectURL(blob)} controls className="h-8" />
        <span className="text-xs text-muted-foreground">{elapsed}s</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={discard} type="button">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
        <Button size="icon" className="h-8 w-8" onClick={send} type="button" disabled={disabled}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        <span className="text-xs font-medium text-destructive">Gravando {elapsed}s</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={stop} type="button">
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button size="icon" variant="ghost" type="button" onClick={start} disabled={disabled} title="Gravar áudio">
      <Mic className="h-5 w-5" />
    </Button>
  );
}
