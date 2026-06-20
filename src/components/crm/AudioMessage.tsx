// Player de áudio robusto: <audio> nativo + waveform via WaveSurfer.
// Funciona em Chrome/Firefox/Safari/iOS porque usa o decoder nativo do navegador.
// Para .ogg/opus do WhatsApp em Safari, o WaveSurfer ainda renderiza a waveform
// porque ele baixa o blob e decodifica via Web Audio API antes de tocar.
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";
import WaveSurfer from "wavesurfer.js";

type Props = {
  url: string;
  duration?: number | null;
  ptt?: boolean;
  isOut?: boolean;
};

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioMessage({ url, duration, ptt, isOut }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState<number>(duration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isOut ? "rgba(255,255,255,0.5)" : "rgba(100,116,139,0.55)",
      progressColor: isOut ? "rgba(255,255,255,0.95)" : "hsl(var(--primary))",
      cursorColor: "transparent",
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 28,
      normalize: true,
      url,
    });
    wsRef.current = ws;

    ws.on("ready", () => {
      setReady(true);
      setTotal(ws.getDuration() || duration || 0);
    });
    ws.on("audioprocess", (t) => setCurrent(t));
    ws.on("seeking", (t) => setCurrent(t));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => { setPlaying(false); setCurrent(0); });
    ws.on("error", (e) => {
      console.warn("[AudioMessage] decode error", e);
      setError("Formato não suportado pelo navegador");
    });

    return () => { ws.destroy(); wsRef.current = null; };
  }, [url, isOut, duration]);

  function toggle() {
    const ws = wsRef.current;
    if (!ws) return;
    ws.playPause();
  }
  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    wsRef.current?.setPlaybackRate(next, true);
  }

  // Fallback puro <audio> quando WaveSurfer não consegue decodificar
  if (error) {
    return (
      <div className="min-w-[220px]">
        <audio src={url} controls preload="metadata" className="w-full h-9" />
        <p className="mt-1 text-[10px] opacity-60">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[240px] max-w-[300px]">
      <button
        type="button"
        onClick={toggle}
        disabled={!ready}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
          isOut ? "bg-white/20 text-white hover:bg-white/30" : "bg-primary text-primary-foreground hover:opacity-90"
        } disabled:opacity-50`}
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>

      <div className="flex-1 min-w-0">
        <div ref={containerRef} className="cursor-pointer" />
        <div className="mt-0.5 flex items-center justify-between text-[10px] opacity-70">
          <span className="flex items-center gap-1">
            {ptt && <Mic className="h-3 w-3" />}
            {fmtTime(playing || current > 0 ? current : total)}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            className="rounded px-1.5 py-0.5 hover:bg-black/10 transition"
            title="Velocidade"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
