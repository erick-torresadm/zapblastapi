import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Play, MessageSquare, Clock, GitBranch, Tag, Webhook, Trash2, Save, Download, Plus,
  ArrowLeft, Rocket, CheckCircle2, Loader2, Image as ImageIcon, Keyboard,
} from "lucide-react";

import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFlowFn, saveFlowDraftFn, publishFlowFn } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/app/flows/$id")({
  component: FlowsPage,
});


/* =========================================================
   Tipos de nó disponíveis no fluxo
   ========================================================= */
type StepType = "start" | "message" | "media" | "typing" | "delay" | "condition" | "tag" | "webhook" | "ask" | "ai" | "transfer_human";

type StepData = {
  label: string;
  description?: string;
  // por tipo:
  message?: string;
  delaySeconds?: number;
  conditionField?: string;
  conditionEquals?: string;
  tag?: string;
  webhookUrl?: string;
  variable?: string;
  systemPrompt?: string;
  userInput?: string;
  // media
  mediatype?: "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  // typing/recording
  presence?: "composing" | "recording";
  seconds?: number;
  [key: string]: unknown;
};


import { HelpCircle, Sparkles as SparklesIcon, UserCog } from "lucide-react";

const STEP_META: Record<StepType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}> = {
  start:          { label: "Início",            icon: Play,           color: "var(--color-primary)", description: "Ponto de entrada do fluxo" },
  message:        { label: "Mensagem",          icon: MessageSquare,  color: "#3b82f6",              description: "Envia texto (com digitando…)" },
  media:          { label: "Mídia",             icon: ImageIcon,      color: "#06b6d4",              description: "Imagem, vídeo, áudio ou documento" },
  typing:         { label: "Digitando…",        icon: Keyboard,       color: "#64748b",              description: "Mostra digitando/gravando por X seg" },
  ask:            { label: "Pergunta",          icon: HelpCircle,     color: "#0ea5e9",              description: "Envia pergunta e guarda a resposta em variável" },
  delay:          { label: "Esperar",           icon: Clock,          color: "#f59e0b",              description: "Aguarda antes do próximo passo" },
  condition:      { label: "Condição",          icon: GitBranch,      color: "#a855f7",              description: "Ramifica em sim / não" },
  tag:            { label: "Tag",               icon: Tag,            color: "#10b981",              description: "Marca contato com um rótulo" },
  ai:             { label: "IA",                icon: SparklesIcon,   color: "#ec4899",              description: "Resposta gerada por IA" },
  transfer_human: { label: "Transferir humano", icon: UserCog,        color: "#6366f1",              description: "Encaminha conversa para atendimento humano" },
  webhook:        { label: "Webhook",           icon: Webhook,        color: "#ef4444",              description: "Chama uma URL externa" },

};

/* =========================================================
   Card de nó (usado para todos os tipos)
   ========================================================= */
function StepNode({ data, selected, type }: NodeProps) {
  const stepType = (type as StepType) ?? "message";
  const meta = STEP_META[stepType];
  const Icon = meta.icon;
  const d = data as StepData;

  const preview =
    stepType === "message"        ? (d.message || "Clique para editar a mensagem…")
  : stepType === "media"          ? (d.mediaUrl ? `${(d.mediatype ?? "image").toUpperCase()}: ${d.mediaUrl.slice(0, 40)}…` : "Configure a mídia…")
  : stepType === "typing"         ? `${d.presence === "recording" ? "Gravando" : "Digitando"} por ${d.seconds ?? 3}s`
  : stepType === "ask"            ? (d.message ? `Pergunta: ${d.message}` : "Configure a pergunta…")
  : stepType === "ai"             ? (d.systemPrompt || "Configure o prompt da IA…")
  : stepType === "transfer_human" ? "Encaminha a conversa para um humano"
  : stepType === "delay"          ? `Aguardar ${d.delaySeconds ?? 60}s`
  : stepType === "condition"      ? `Se "${d.conditionField || "campo"}" = "${d.conditionEquals || "valor"}"`
  : stepType === "tag"            ? `Adicionar tag: ${d.tag || "—"}`
  : stepType === "webhook"        ? (d.webhookUrl || "Configure a URL")
  : "Ponto de entrada — o fluxo começa aqui";


  return (
    <div
      className={`group relative min-w-[220px] max-w-[260px] rounded-xl border bg-card/95 backdrop-blur transition-all
        ${selected ? "border-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]" : "border-border/60 hover:border-border"}`}
      style={{ boxShadow: selected ? undefined : "0 4px 16px -8px rgba(0,0,0,0.3)" }}
    >
      {stepType !== "start" && (
        <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-background" style={{ background: meta.color }} />
      )}

      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
          style={{ background: meta.color, boxShadow: `0 0 14px -4px ${meta.color}` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</div>
          <div className="truncate text-sm font-medium">{d.label}</div>
        </div>
      </div>

      <div className="px-3 py-2.5 text-xs text-muted-foreground line-clamp-3">{preview}</div>

      {stepType === "condition" ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "30%", background: "#10b981" }} className="!h-3 !w-3 !border-2 !border-background" />
          <Handle id="no"  type="source" position={Position.Bottom} style={{ left: "70%", background: "#ef4444" }} className="!h-3 !w-3 !border-2 !border-background" />
          <div className="flex justify-between border-t border-border/60 px-3 py-1 text-[10px] font-medium">
            <span className="text-emerald-500">SIM</span>
            <span className="text-red-500">NÃO</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-background" style={{ background: meta.color }} />
      )}
    </div>
  );
}

const nodeTypes = {
  start: StepNode,
  message: StepNode,
  media: StepNode,
  typing: StepNode,
  ask: StepNode,
  delay: StepNode,
  condition: StepNode,
  tag: StepNode,
  ai: StepNode,
  transfer_human: StepNode,
  webhook: StepNode,
};


/* =========================================================
   Estado inicial
   ========================================================= */
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

/* =========================================================
   Página
   ========================================================= */
function FlowsPage() {
  return (
    <ReactFlowProvider>
      <FlowsInner />
    </ReactFlowProvider>
  );
}

function FlowsInner() {
  const { id } = useParams({ from: "/_authenticated/app/flows/$id" });
  const qc = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Carregando…");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);

  const getFlow = useServerFn(getFlowFn);
  const saveDraft = useServerFn(saveFlowDraftFn);
  const publish = useServerFn(publishFlowFn);

  // Carrega o fluxo do servidor
  const { data: flowData } = useQuery({
    queryKey: ["flow", id],
    queryFn: () => getFlow({ data: { id } }),
  });

  useEffect(() => {
    if (!flowData || loaded) return;
    const f: any = flowData.flow;
    setFlowName(f.name ?? "Fluxo");
    setNodes((f.draft_nodes ?? []) as Node[]);
    setEdges((f.draft_edges ?? []) as Edge[]);
    setLoaded(true);
  }, [flowData, loaded, setEdges, setNodes]);

  // Mutation de salvar
  const saveMut = useMutation({
    mutationFn: (silent?: boolean) =>
      saveDraft({ data: { id, name: flowName, nodes, edges } }).then((r) => ({ r, silent })),
    onSuccess: ({ r, silent }) => {
      setSavedAt(r.saved_at);
      dirtyRef.current = false;
      if (!silent) toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: () => publish({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Publicado v${r.version}`);
      qc.invalidateQueries({ queryKey: ["flow", id] });
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Marca dirty quando muda
  useEffect(() => { if (loaded) dirtyRef.current = true; }, [nodes, edges, flowName, loaded]);

  // Autosave a cada 8s se houver alterações
  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(() => {
      if (dirtyRef.current && !saveMut.isPending) saveMut.mutate(true);
    }, 8000);
    return () => clearInterval(t);
  }, [loaded, saveMut]);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (loaded && !saveMut.isPending) saveMut.mutate(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [loaded, saveMut]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);


  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({
      ...c,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
    }, eds));
  }, [setEdges]);

  // ---- drag-and-drop da palette ----
  const onDragStart = (e: React.DragEvent, type: StepType) => {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/reactflow") as StepType;
    if (!type || !rfRef.current) return;
    const pos = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `n_${Date.now()}`;
    const meta = STEP_META[type];
    setNodes((nds) => nds.concat({
      id, type, position: pos,
      data: { label: meta.label } as StepData,
    }));
    setSelectedId(id);
  };

  const addNode = (type: StepType) => {
    const id = `n_${Date.now()}`;
    const meta = STEP_META[type];
    const last = nodes[nodes.length - 1];
    setNodes((nds) => nds.concat({
      id, type,
      position: { x: (last?.position.x ?? 240) + 40, y: (last?.position.y ?? 100) + 140 },
      data: { label: meta.label } as StepData,
    }));
    setSelectedId(id);
  };

  const updateSelected = (patch: Partial<StepData>) => {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n));
  };
  const deleteSelected = () => {
    if (!selectedId || selectedId === "start") return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name: flowName, nodes, edges }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${flowName.replace(/\s+/g, "_")}.json`;
    a.click();
  };

  const savedLabel = savedAt ? `Salvo ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Não salvo";
  const status = (flowData?.flow as any)?.status as string | undefined;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link to="/app/flows"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Input
                value={flowName} onChange={(e) => setFlowName(e.target.value)}
                className="h-8 w-64 border-transparent bg-transparent px-1 text-lg font-bold hover:border-border focus-visible:border-border"
                placeholder="Nome do fluxo"
              />
              {status && <Badge variant={status === "active" ? "default" : "outline"} className="capitalize">{status}</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {saveMut.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando…</>
                : dirtyRef.current ? "Alterações não salvas"
                : <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {savedLabel}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}><Download className="mr-2 h-4 w-4" />Exportar</Button>
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}>
            <Save className="mr-2 h-4 w-4" />Salvar
          </Button>
          <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
            <Rocket className="mr-2 h-4 w-4" />Publicar
          </Button>
        </div>
      </div>


      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Palette */}
        <Card className="w-60 shrink-0 overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Blocos</CardTitle>
            <CardDescription className="text-xs">Arraste para o canvas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(STEP_META) as StepType[]).filter((t) => t !== "start").map((t) => {
              const m = STEP_META[t]; const Icon = m.icon;
              return (
                <div
                  key={t}
                  draggable
                  onDragStart={(e) => onDragStart(e, t)}
                  onDoubleClick={() => addNode(t)}
                  className="group flex cursor-grab items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing"
                  title="Arraste para o canvas ou clique duplo para adicionar"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                    style={{ background: m.color, boxShadow: `0 0 12px -4px ${m.color}` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{m.label}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{m.description}</div>
                  </div>
                </div>
              );
            })}
            <Button size="sm" variant="outline" className="w-full" onClick={() => addNode("message")}>
              <Plus className="mr-2 h-3.5 w-3.5" />Adicionar mensagem
            </Button>
          </CardContent>
        </Card>

        {/* Canvas */}
        <div
          ref={wrapperRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-border/60 bg-[var(--background)]"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => { rfRef.current = inst; }}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }}
            connectionLineStyle={{ strokeWidth: 2, stroke: "var(--color-primary)" }}
          >
            <Background gap={20} size={1.5} color="color-mix(in oklab, var(--color-foreground) 12%, transparent)" />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              pannable zoomable
              className="!bg-card !border-border"
              nodeColor={(n) => STEP_META[(n.type as StepType) ?? "message"].color}
              maskColor="color-mix(in oklab, var(--background) 80%, transparent)"
            />
          </ReactFlow>
        </div>
      </div>

      {/* Painel de propriedades */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <SheetContent side="right" className="w-[400px] sm:w-[420px]">
          {selected && (() => {
            const t = (selected.type as StepType) ?? "message";
            const meta = STEP_META[t];
            const d = selected.data as StepData;
            const Icon = meta.icon;
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                      style={{ background: meta.color, boxShadow: `0 0 18px -4px ${meta.color}` }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <SheetTitle>{meta.label}</SheetTitle>
                      <SheetDescription>{meta.description}</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                  <div>
                    <Label htmlFor="label">Nome do passo</Label>
                    <Input id="label" value={d.label} onChange={(e) => updateSelected({ label: e.target.value })} />
                  </div>


                  {t === "message" && (
                    <div>
                      <Label htmlFor="message">Mensagem</Label>
                      <Textarea
                        id="message" rows={6}
                        value={d.message ?? ""}
                        onChange={(e) => updateSelected({ message: e.target.value })}
                        placeholder="Olá {{nome}}, tudo bem?"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Use <code className="rounded bg-muted px-1">{"{{nome}}"}</code>, <code className="rounded bg-muted px-1">{"{{telefone}}"}</code> ou outras variáveis. O "digitando…" aparece automaticamente.
                      </p>
                    </div>
                  )}

                  {t === "media" && (
                    <>
                      <div>
                        <Label>Tipo de mídia</Label>
                        <div className="mt-1 grid grid-cols-4 gap-1">
                          {(["image","video","audio","document"] as const).map((mt) => (
                            <Button key={mt} type="button" size="sm"
                              variant={(d.mediatype ?? "image") === mt ? "default" : "outline"}
                              onClick={() => updateSelected({ mediatype: mt })}
                              className="capitalize">{mt}</Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="media-url">URL ou base64 da mídia</Label>
                        <Input id="media-url" value={d.mediaUrl ?? ""} onChange={(e) => updateSelected({ mediaUrl: e.target.value })} placeholder="https://… ou data:image/png;base64,…" />
                        <p className="mt-1 text-[11px] text-muted-foreground">URL pública (faça upload no menu Campanhas → Mídia) ou data URI.</p>
                      </div>
                      {(d.mediatype === "document") && (
                        <div>
                          <Label htmlFor="filename">Nome do arquivo</Label>
                          <Input id="filename" value={d.fileName ?? ""} onChange={(e) => updateSelected({ fileName: e.target.value })} placeholder="contrato.pdf" />
                        </div>
                      )}
                      {d.mediatype !== "audio" && (
                        <div>
                          <Label htmlFor="caption">Legenda (opcional)</Label>
                          <Textarea id="caption" rows={3} value={d.caption ?? ""} onChange={(e) => updateSelected({ caption: e.target.value })} placeholder="Olha só {{nome}}!" />
                        </div>
                      )}
                    </>
                  )}

                  {t === "typing" && (
                    <>
                      <div>
                        <Label>Mostrar</Label>
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <Button type="button" size="sm" variant={(d.presence ?? "composing") === "composing" ? "default" : "outline"} onClick={() => updateSelected({ presence: "composing" })}>Digitando…</Button>
                          <Button type="button" size="sm" variant={d.presence === "recording" ? "default" : "outline"} onClick={() => updateSelected({ presence: "recording" })}>Gravando áudio</Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="typing-secs">Duração (segundos)</Label>
                        <Input id="typing-secs" type="number" min={1} max={15} value={d.seconds ?? 3} onChange={(e) => updateSelected({ seconds: Number(e.target.value) })} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Não envia mensagem — só mostra o indicador no WhatsApp do contato.</p>
                    </>
                  )}

                  {t === "ask" && (
                    <>
                      <div>
                        <Label htmlFor="ask-message">Pergunta</Label>
                        <Textarea id="ask-message" rows={4} value={d.message ?? ""} onChange={(e) => updateSelected({ message: e.target.value })} placeholder="Como posso te chamar?" />
                      </div>
                      <div>
                        <Label htmlFor="ask-var">Salvar resposta em</Label>
                        <Input id="ask-var" value={d.variable ?? ""} onChange={(e) => updateSelected({ variable: e.target.value })} placeholder="nome" />
                        <p className="mt-1 text-[11px] text-muted-foreground">Use depois como <code className="rounded bg-muted px-1">{`{{${d.variable || "nome"}}}`}</code></p>
                      </div>
                    </>
                  )}


                  {t === "ai" && (
                    <>
                      <div>
                        <Label htmlFor="ai-sys">Instrução para a IA</Label>
                        <Textarea id="ai-sys" rows={5} value={d.systemPrompt ?? ""} onChange={(e) => updateSelected({ systemPrompt: e.target.value })} placeholder="Você é um atendente educado..." />
                      </div>
                      <div>
                        <Label htmlFor="ai-input">Entrada do usuário</Label>
                        <Input id="ai-input" value={(d.userInput as string) ?? ""} onChange={(e) => updateSelected({ userInput: e.target.value })} placeholder="{{pergunta}}" />
                      </div>
                    </>
                  )}

                  {t === "transfer_human" && (
                    <p className="text-xs text-muted-foreground">Esse passo encerra a automação e notifica seu time para assumir a conversa.</p>
                  )}


                  {t === "delay" && (
                    <div>
                      <Label htmlFor="delay">Esperar (segundos)</Label>
                      <Input
                        id="delay" type="number" min={1}
                        value={d.delaySeconds ?? 60}
                        onChange={(e) => updateSelected({ delaySeconds: Number(e.target.value) })}
                      />
                    </div>
                  )}

                  {t === "condition" && (
                    <>
                      <div>
                        <Label htmlFor="field">Campo do contato</Label>
                        <Input id="field" value={d.conditionField ?? ""} onChange={(e) => updateSelected({ conditionField: e.target.value })} placeholder="cidade" />
                      </div>
                      <div>
                        <Label htmlFor="equals">É igual a</Label>
                        <Input id="equals" value={d.conditionEquals ?? ""} onChange={(e) => updateSelected({ conditionEquals: e.target.value })} placeholder="São Paulo" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">A saída <span className="font-medium text-emerald-500">SIM</span> dispara quando a condição bate.</p>
                    </>
                  )}

                  {t === "tag" && (
                    <div>
                      <Label htmlFor="tag">Tag</Label>
                      <Input id="tag" value={d.tag ?? ""} onChange={(e) => updateSelected({ tag: e.target.value })} placeholder="quente" />
                    </div>
                  )}

                  {t === "webhook" && (
                    <div>
                      <Label htmlFor="url">URL</Label>
                      <Input id="url" value={d.webhookUrl ?? ""} onChange={(e) => updateSelected({ webhookUrl: e.target.value })} placeholder="https://meu-sistema.com/hook" />
                    </div>
                  )}

                  {t !== "start" && (
                    <Button variant="destructive" className="w-full" onClick={deleteSelected}>
                      <Trash2 className="mr-2 h-4 w-4" />Remover passo
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
