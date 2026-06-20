// Editor multi-step de funil interativo (estilo Inlead/Heyflow).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFunnelFn, updateFunnelFn, listContactListsFn,
  upsertDomainFn, removeDomainFn, verifyDomainFn,
} from "@/lib/traffic.functions";
import {
  createStepFn, updateStepFn, deleteStepFn, reorderStepsFn, saveStepBlocksFn,
} from "@/lib/traffic-steps.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Save, ExternalLink, Globe, Eye, GripVertical, Copy,
} from "lucide-react";
import { FunnelBlockRenderer, type Block } from "@/components/traffic/FunnelBlockRenderer";
import { BLOCK_LIBRARY } from "@/components/traffic/blockLibrary";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/traffic/$id/editor")({
  component: EditorPage,
});

const STEP_TYPES = [
  { value: "intro", label: "Boas-vindas" },
  { value: "question", label: "Pergunta" },
  { value: "loading", label: "Loading" },
  { value: "result", label: "Resultado" },
  { value: "form", label: "Captura" },
  { value: "offer", label: "Oferta" },
  { value: "redirect", label: "Redirect" },
  { value: "custom", label: "Custom" },
];

function EditorPage() {
  const { id } = Route.useParams();
  const getFunnel = useServerFn(getFunnelFn);
  const update = useServerFn(updateFunnelFn);
  const listLists = useServerFn(listContactListsFn);
  const upsertDomain = useServerFn(upsertDomainFn);
  const removeDomain = useServerFn(removeDomainFn);
  const verifyDomain = useServerFn(verifyDomainFn);
  const createStep = useServerFn(createStepFn);
  const updateStep = useServerFn(updateStepFn);
  const deleteStep = useServerFn(deleteStepFn);
  const reorderSteps = useServerFn(reorderStepsFn);
  const saveBlocks = useServerFn(saveStepBlocksFn);
  const qc = useQueryClient();

  const { data } = useSuspenseQuery({
    queryKey: ["traffic-funnel", id],
    queryFn: () => getFunnel({ data: { id } }),
  });
  const { data: lists } = useSuspenseQuery({
    queryKey: ["contact-lists"],
    queryFn: () => listLists(),
  });

  const f = data.funnel;

  // organiza steps + blocks
  const stepsInitial = useMemo(() => {
    const allBlocks = data.blocks as Block[];
    return (data.steps as any[]).map((s) => ({
      ...s,
      blocks: allBlocks.filter((b: any) => b.step_id === s.id).sort((a: any, b: any) => a.position - b.position),
    }));
  }, [data]);

  const [steps, setSteps] = useState(stepsInitial);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setSteps(stepsInitial); setDirty(false); }, [stepsInitial]);

  const activeStep = steps[activeStepIdx];
  const blocks: Block[] = activeStep?.blocks ?? [];

  // settings
  const [title, setTitle] = useState(f.title);
  const [primaryColor, setPrimaryColor] = useState(f.primary_color);
  const [fontFamily, setFontFamily] = useState(f.font_family);
  const [seoTitle, setSeoTitle] = useState(f.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(f.seo_description ?? "");
  const [ogImage, setOgImage] = useState(f.og_image_url ?? "");
  const [defaultList, setDefaultList] = useState(f.default_list_id ?? "");
  const settingsObj = (f.settings ?? {}) as any;
  const [pixelId, setPixelId] = useState(settingsObj.pixel_id ?? "");
  const [capiToken, setCapiToken] = useState(settingsObj.capi_token ?? "");
  const [ga4Id, setGa4Id] = useState(settingsObj.ga4_id ?? "");
  const [gtmId, setGtmId] = useState(settingsObj.gtm_id ?? "");
  const [published, setPublished] = useState(f.status === "published");
  const [redirectUrl, setRedirectUrl] = useState(f.redirect_url ?? "");

  const existingDomain = data.domains[0];
  const [customHost, setCustomHost] = useState(existingDomain?.host ?? "");

  function markDirty() { setDirty(true); }
  function updateStepLocal(idx: number, patch: any) {
    const next = [...steps]; next[idx] = { ...next[idx], ...patch }; setSteps(next); markDirty();
  }

  // ===== Block operations =====
  function addBlock(type: string) {
    const def = BLOCK_LIBRARY.find((b) => b.type === type)!;
    const newBlock: Block = {
      type, position: blocks.length, props: { ...def.defaults },
      field_key: def.hasFieldKey ? `${type}_${Date.now()}` : null,
    };
    updateStepLocal(activeStepIdx, { blocks: [...blocks, newBlock] });
    setSelectedBlockIdx(blocks.length);
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    const t = idx + dir; if (t < 0 || t >= blocks.length) return;
    const next = [...blocks]; [next[idx], next[t]] = [next[t], next[idx]];
    updateStepLocal(activeStepIdx, { blocks: next }); setSelectedBlockIdx(t);
  }
  function removeBlock(idx: number) {
    updateStepLocal(activeStepIdx, { blocks: blocks.filter((_, i) => i !== idx) });
    setSelectedBlockIdx(null);
  }
  function updateBlockProps(idx: number, props: Record<string, unknown>) {
    const next = [...blocks]; next[idx] = { ...next[idx], props };
    updateStepLocal(activeStepIdx, { blocks: next });
  }
  function updateBlockFieldKey(idx: number, fk: string) {
    const next = [...blocks]; next[idx] = { ...next[idx], field_key: fk };
    updateStepLocal(activeStepIdx, { blocks: next });
  }

  // ===== Step operations =====
  async function addStep() {
    try {
      const s = await createStep({ data: { funnel_id: id, name: `Página ${steps.length + 1}`, type: "question", position: steps.length } });
      setSteps([...steps, { ...s, blocks: [] }]);
      setActiveStepIdx(steps.length);
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function removePage(stepId: string, idx: number) {
    if (!confirm("Excluir esta página?")) return;
    try {
      await deleteStep({ data: { id: stepId } });
      const next = steps.filter((_, i) => i !== idx);
      setSteps(next);
      setActiveStepIdx(Math.max(0, idx - 1));
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function moveStep(idx: number, dir: -1 | 1) {
    const t = idx + dir; if (t < 0 || t >= steps.length) return;
    const next = [...steps]; [next[idx], next[t]] = [next[t], next[idx]];
    setSteps(next); setActiveStepIdx(t);
    try { await reorderSteps({ data: { funnel_id: id, step_ids: next.map((s) => s.id) } }); }
    catch (e) { toast.error((e as Error).message); }
  }

  // ===== Save all =====
  async function saveAll() {
    try {
      await update({ data: {
        id, title, status: published ? "published" : "draft",
        primary_color: primaryColor, font_family: fontFamily,
        seo_title: seoTitle || null, seo_description: seoDesc || null,
        og_image_url: ogImage || null, default_list_id: defaultList || null,
        settings: { pixel_id: pixelId || undefined, capi_token: capiToken || undefined, ga4_id: ga4Id || undefined, gtm_id: gtmId || undefined },
      }});
      // salva blocks + meta de cada step
      for (const s of steps) {
        await updateStep({ data: { id: s.id, name: s.name, type: s.type, settings: s.settings ?? {} } });
        await saveBlocks({ data: { funnel_id: id, step_id: s.id, blocks: s.blocks } });
      }
      // redirect_url no funil
      await update({ data: { id, settings: { ...(f.settings as any), pixel_id: pixelId || undefined, capi_token: capiToken || undefined, ga4_id: ga4Id || undefined, gtm_id: gtmId || undefined } } });
      toast.success("Salvo");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
      qc.invalidateQueries({ queryKey: ["traffic-funnels"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function saveDomain() {
    try {
      await upsertDomain({ data: { funnel_id: id, host: customHost.trim().toLowerCase() } });
      toast.success("Domínio adicionado. Configure o DNS e verifique.");
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doVerify(domainId: string) {
    try {
      const r = await verifyDomain({ data: { domain_id: domainId } });
      r.ok ? toast.success(r.message ?? "Verificado") : toast.error(r.message ?? "Falhou");
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doRemoveDomain(domainId: string) {
    if (!confirm("Remover domínio?")) return;
    await removeDomain({ data: { domain_id: domainId } });
    setCustomHost("");
    qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
  }

  const selected = selectedBlockIdx !== null ? blocks[selectedBlockIdx] : null;

  const renderCtx = {
    funnelSlug: f.slug, primaryColor, trackEvent: () => {},
    onAnswer: () => {}, onNext: () => {}, answers: {}, preview: true,
  };

  // group block library by category
  const groupedLib = BLOCK_LIBRARY.reduce((acc: Record<string, typeof BLOCK_LIBRARY>, b) => {
    (acc[b.category] ??= []).push(b); return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/app/traffic"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
          <h1 className="text-lg font-semibold">{f.title}</h1>
          <Badge variant={published ? "default" : "secondary"}>{published ? "Publicado" : "Rascunho"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><Eye className="h-4 w-4 mr-1" />Preview</a></Button>
          <Button size="sm" onClick={saveAll} disabled={!dirty}><Save className="h-4 w-4 mr-1" />Salvar</Button>
        </div>
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="lead">Leads</TabsTrigger>
          <TabsTrigger value="domain">Domínio</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="publish">Publicar</TabsTrigger>
        </TabsList>

        {/* ============ EDITOR multi-step ============ */}
        <TabsContent value="editor">
          <div className="grid gap-3 lg:grid-cols-[200px_240px_1fr_320px]">
            {/* Páginas (steps) */}
            <Card className="p-2 space-y-1 h-fit">
              <div className="flex items-center justify-between px-1 py-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase">Páginas</h3>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={addStep}><Plus className="h-3 w-3" /></Button>
              </div>
              {steps.map((s, i) => (
                <div key={s.id}
                  className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs cursor-pointer ${activeStepIdx === i ? "bg-accent border-primary" : "hover:bg-muted/50"}`}
                  onClick={() => { setActiveStepIdx(i); setSelectedBlockIdx(null); }}>
                  <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }} className="p-0.5 hover:bg-background rounded"><ArrowUp className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }} className="p-0.5 hover:bg-background rounded"><ArrowDown className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); removePage(s.id, i); }} className="p-0.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-2 py-3">Nenhuma página. Clique em + para criar.</p>
              )}
            </Card>

            {/* Library */}
            <Card className="p-2 space-y-3 h-fit">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase px-1">Blocos</h3>
              {(["basic","input","media","conversion","advanced"] as const).map((cat) => (
                <div key={cat} className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase px-1">{
                    cat==="basic"?"Básicos":cat==="input"?"Entrada":cat==="media"?"Mídia":cat==="conversion"?"Conversão":"Avançados"
                  }</p>
                  {(groupedLib[cat] ?? []).map((b) => (
                    <Button key={b.type} variant="outline" size="sm" className="w-full justify-start h-8 text-xs"
                      disabled={!activeStep} onClick={() => addBlock(b.type)}>
                      <Plus className="h-3 w-3 mr-1" />{b.label}
                    </Button>
                  ))}
                </div>
              ))}
            </Card>

            {/* Canvas */}
            <Card className="p-4 min-h-[500px]" style={{ fontFamily }}>
              {!activeStep && <p className="text-center text-sm text-muted-foreground py-12">Crie uma página primeiro.</p>}
              {activeStep && (
                <>
                  <div className="mb-3 pb-3 border-b flex items-center justify-between gap-2">
                    <Input value={activeStep.name} onChange={(e) => updateStepLocal(activeStepIdx, { name: e.target.value })} className="h-8 text-sm font-semibold max-w-xs" />
                    <Select value={activeStep.type} onValueChange={(v) => updateStepLocal(activeStepIdx, { type: v })}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STEP_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {blocks.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">Nenhum bloco. Adicione um do menu à esquerda.</p>}
                  <div className="mx-auto max-w-xl space-y-4">
                    {blocks.map((b, i) => (
                      <div key={i} onClick={() => setSelectedBlockIdx(i)}
                        className={`relative group rounded-lg p-3 cursor-pointer transition ${selectedBlockIdx === i ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}>
                        <FunnelBlockRenderer block={b} ctx={renderCtx} />
                        <div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 bg-background border rounded-md p-0.5 shadow">
                          <button onClick={(e) => { e.stopPropagation(); moveBlock(i, -1); }} className="p-1 hover:bg-muted rounded" title="Subir"><ArrowUp className="h-3 w-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); moveBlock(i, 1); }} className="p-1 hover:bg-muted rounded" title="Descer"><ArrowDown className="h-3 w-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); removeBlock(i); }} className="p-1 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Props */}
            <Card className="p-3 h-fit space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Propriedades</h3>
              {!selected && <p className="text-xs text-muted-foreground">Selecione um bloco para editar.</p>}
              {selected && (
                <BlockPropsEditor
                  block={selected}
                  onChange={(p) => updateBlockProps(selectedBlockIdx!, p)}
                  onFieldKeyChange={(fk) => updateBlockFieldKey(selectedBlockIdx!, fk)}
                />
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ============ DESIGN ============ */}
        <TabsContent value="design">
          <Card className="p-4 max-w-xl space-y-4">
            <div><Label>Título do funil</Label><Input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} /></div>
            <div>
              <Label>Cor primária</Label>
              <div className="flex gap-2">
                <Input type="color" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); markDirty(); }} className="w-20 h-10 p-1" />
                <Input value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); markDirty(); }} />
              </div>
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={fontFamily} onValueChange={(v) => { setFontFamily(v); markDirty(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="system-ui">System UI</SelectItem>
                  <SelectItem value="Georgia">Georgia</SelectItem>
                  <SelectItem value="'Courier New', monospace">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Redirect final (após captura)</Label>
              <Input value={redirectUrl} onChange={(e) => { setRedirectUrl(e.target.value); markDirty(); }} placeholder="https://checkout.exemplo.com/oferta" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tracking">
          <Card className="p-4 max-w-2xl space-y-4">
            <div><h3 className="font-semibold">Facebook Pixel + CAPI</h3></div>
            <div><Label>Pixel ID</Label><Input value={pixelId} onChange={(e) => { setPixelId(e.target.value); markDirty(); }} placeholder="1234567890" /></div>
            <div><Label>Conversions API Token</Label><Input type="password" value={capiToken} onChange={(e) => { setCapiToken(e.target.value); markDirty(); }} /></div>
            <div className="border-t pt-4"><h3 className="font-semibold">Google Analytics 4 / GTM</h3></div>
            <div><Label>GA4 Measurement ID</Label><Input value={ga4Id} onChange={(e) => { setGa4Id(e.target.value); markDirty(); }} placeholder="G-XXXXXXXXXX" /></div>
            <div><Label>GTM Container ID</Label><Input value={gtmId} onChange={(e) => { setGtmId(e.target.value); markDirty(); }} placeholder="GTM-XXXXXX" /></div>
          </Card>
        </TabsContent>

        <TabsContent value="lead">
          <Card className="p-4 max-w-xl space-y-4">
            <div>
              <Label>Lista CRM padrão</Label>
              <Select value={defaultList || "__none__"} onValueChange={(v) => { setDefaultList(v === "__none__" ? "" : v); markDirty(); }}>
                <SelectTrigger><SelectValue placeholder="Sem lista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem lista</SelectItem>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="domain">
          <Card className="p-4 max-w-2xl space-y-4">
            <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><h3 className="font-semibold">Domínio próprio</h3></div>
            <div className="flex gap-2">
              <Input value={customHost} onChange={(e) => setCustomHost(e.target.value)} placeholder="funil.seudominio.com" />
              <Button onClick={saveDomain} disabled={!customHost}>Adicionar</Button>
            </div>
            {existingDomain && (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm">{existingDomain.host}</p>
                    <Badge variant={existingDomain.dns_ok ? "default" : "secondary"} className="mt-1">
                      {existingDomain.dns_ok ? "DNS verificado" : "Aguardando DNS"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => doVerify(existingDomain.id)}>Verificar</Button>
                    <Button size="sm" variant="ghost" onClick={() => doRemoveDomain(existingDomain.id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="bg-muted/40 rounded p-3 text-xs space-y-2 font-mono">
                  <div><strong>1) CNAME</strong><br />Nome: <code>{existingDomain.host.split(".")[0]}</code><br />Aponta para: <code>zapblastapi.lovable.app</code></div>
                  <div><strong>2) TXT</strong><br />Nome: <code>_zapblast-verify.{existingDomain.host.split(".")[0]}</code><br />Valor: <code>{existingDomain.verify_token}</code></div>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="seo">
          <Card className="p-4 max-w-xl space-y-4">
            <div><Label>Título SEO</Label><Input value={seoTitle} onChange={(e) => { setSeoTitle(e.target.value); markDirty(); }} /></div>
            <div><Label>Descrição SEO</Label><Textarea value={seoDesc} onChange={(e) => { setSeoDesc(e.target.value); markDirty(); }} rows={3} /></div>
            <div><Label>OG Image URL (1200x630)</Label><Input value={ogImage} onChange={(e) => { setOgImage(e.target.value); markDirty(); }} /></div>
          </Card>
        </TabsContent>

        <TabsContent value="publish">
          <Card className="p-4 max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Publicar funil</Label>
                <p className="text-xs text-muted-foreground">Acessível em /f/{f.slug}</p>
              </div>
              <Switch checked={published} onCheckedChange={(v) => { setPublished(v); markDirty(); }} />
            </div>
            {published && (
              <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir página publicada
              </a>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ====== Props editor ====== */
function BlockPropsEditor({ block, onChange, onFieldKeyChange }: {
  block: Block;
  onChange: (p: Record<string, unknown>) => void;
  onFieldKeyChange: (fk: string) => void;
}) {
  const p = block.props as any;
  const set = (k: string, v: unknown) => onChange({ ...p, [k]: v });

  // chave do campo (apenas blocos input)
  const showFieldKey = ["choice", "multi-choice", "input"].includes(block.type);

  return (
    <div className="space-y-3 text-sm">
      {showFieldKey && (
        <div>
          <Label className="text-xs">Chave da resposta</Label>
          <Input className="h-8" value={block.field_key ?? ""} onChange={(e) => onFieldKeyChange(e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())} placeholder="ex: idade" />
        </div>
      )}

      {(block.type === "headline" || block.type === "text") && (
        <>
          <div><Label className="text-xs">Texto</Label><Textarea value={p.text ?? ""} onChange={(e) => set("text", e.target.value)} rows={3} /></div>
          <div><Label className="text-xs">Alinhamento</Label>
            <Select value={p.align ?? "left"} onValueChange={(v) => set("align", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="left">Esq</SelectItem><SelectItem value="center">Centro</SelectItem><SelectItem value="right">Dir</SelectItem></SelectContent>
            </Select>
          </div>
          {block.type === "headline" && (
            <div><Label className="text-xs">Tamanho</Label>
              <Select value={p.size ?? "xl"} onValueChange={(v) => set("size", v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="lg">Médio</SelectItem><SelectItem value="xl">Grande</SelectItem><SelectItem value="2xl">Hero</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {(block.type === "image" || block.type === "video" || block.type === "audio") && (
        <>
          <div><Label className="text-xs">URL</Label><Input value={p.url ?? ""} onChange={(e) => set("url", e.target.value)} /></div>
          {block.type === "image" && <div><Label className="text-xs">Alt</Label><Input value={p.alt ?? ""} onChange={(e) => set("alt", e.target.value)} /></div>}
        </>
      )}

      {block.type === "choice" && (
        <>
          <div><Label className="text-xs">Label</Label><Input value={p.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
          <div><Label className="text-xs">Layout</Label>
            <Select value={p.layout ?? "grid"} onValueChange={(v) => set("layout", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="grid">Cards (grid)</SelectItem><SelectItem value="list">Lista</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.autoNext ?? true} onChange={(e) => set("autoNext", e.target.checked)} />Avançar automaticamente</label>
          <OptionsEditor options={p.options ?? []} onChange={(opts) => set("options", opts)} withImage />
        </>
      )}

      {block.type === "multi-choice" && (
        <>
          <div><Label className="text-xs">Label</Label><Input value={p.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
          <OptionsEditor options={p.options ?? []} onChange={(opts) => set("options", opts)} />
        </>
      )}

      {block.type === "input" && (
        <>
          <div><Label className="text-xs">Label</Label><Input value={p.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
          <div><Label className="text-xs">Placeholder</Label><Input value={p.placeholder ?? ""} onChange={(e) => set("placeholder", e.target.value)} /></div>
          <div><Label className="text-xs">Tipo</Label>
            <Select value={p.inputType ?? "text"} onValueChange={(v) => set("inputType", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="number">Número</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {(block.type === "button-next" || block.type === "button-link" || block.type === "button-whatsapp" || block.type === "button-agenda") && (
        <>
          <div><Label className="text-xs">Texto do botão</Label><Input value={p.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
          {block.type === "button-link" && <div><Label className="text-xs">URL</Label><Input value={p.url ?? ""} onChange={(e) => set("url", e.target.value)} /></div>}
          {block.type === "button-whatsapp" && (<>
            <div><Label className="text-xs">Telefone</Label><Input value={p.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="5511999999999" /></div>
            <div><Label className="text-xs">Mensagem</Label><Textarea value={p.message ?? ""} onChange={(e) => set("message", e.target.value)} rows={2} /></div>
          </>)}
          {block.type === "button-agenda" && <div><Label className="text-xs">Slug da agenda</Label><Input value={p.slug ?? ""} onChange={(e) => set("slug", e.target.value)} /></div>}
          {block.type === "button-next" && (
            <div><Label className="text-xs">Estilo</Label>
              <Select value={p.style ?? "primary"} onValueChange={(v) => set("style", v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="primary">Preenchido</SelectItem><SelectItem value="outline">Outline</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {block.type === "form" && (
        <>
          <div><Label className="text-xs">Título</Label><Input value={p.title ?? ""} onChange={(e) => set("title", e.target.value)} /></div>
          <div><Label className="text-xs">Texto do botão</Label><Input value={p.submitLabel ?? ""} onChange={(e) => set("submitLabel", e.target.value)} /></div>
          <div><Label className="text-xs">Campos</Label>
            <div className="flex flex-col gap-1">
              {["name","phone","email"].map((fld) => {
                const fields = (p.fields as string[]) ?? [];
                return (
                  <label key={fld} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={fields.includes(fld)} onChange={() => {
                      set("fields", fields.includes(fld) ? fields.filter((x) => x !== fld) : [...fields, fld]);
                    }} />{fld}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      {block.type === "testimonial" && (
        <>
          <div><Label className="text-xs">Depoimento</Label><Textarea value={p.text ?? ""} onChange={(e) => set("text", e.target.value)} rows={3} /></div>
          <div><Label className="text-xs">Autor</Label><Input value={p.author ?? ""} onChange={(e) => set("author", e.target.value)} /></div>
        </>
      )}

      {block.type === "faq" && (
        <FaqEditor items={p.items ?? []} onChange={(items) => set("items", items)} />
      )}

      {block.type === "countdown" && (
        <>
          <div><Label className="text-xs">Minutos</Label><Input type="number" value={p.minutes ?? 15} onChange={(e) => set("minutes", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Label</Label><Input value={p.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
        </>
      )}

      {block.type === "loading" && (
        <>
          <div><Label className="text-xs">Texto principal</Label><Input value={p.text ?? ""} onChange={(e) => set("text", e.target.value)} /></div>
          <div><Label className="text-xs">Duração (ms)</Label><Input type="number" value={p.durationMs ?? 3000} onChange={(e) => set("durationMs", Number(e.target.value))} /></div>
          <div><Label className="text-xs">Etapas (uma por linha)</Label>
            <Textarea rows={3} value={((p.steps as string[]) ?? []).join("\n")} onChange={(e) => set("steps", e.target.value.split("\n").filter(Boolean))} />
          </div>
        </>
      )}

      {block.type === "progress" && (
        <div><Label className="text-xs">Valor (0-100)</Label><Input type="number" value={p.value ?? 50} onChange={(e) => set("value", Number(e.target.value))} /></div>
      )}

      {block.type === "html" && (
        <div><Label className="text-xs">HTML</Label><Textarea rows={6} value={p.html ?? ""} onChange={(e) => set("html", e.target.value)} /></div>
      )}

      {block.type === "spacer" && (
        <div><Label className="text-xs">Altura (px)</Label><Input type="number" value={p.height ?? 24} onChange={(e) => set("height", Number(e.target.value))} /></div>
      )}
    </div>
  );
}

function OptionsEditor({ options, onChange, withImage }: { options: Array<{ value: string; label: string; image?: string }>; onChange: (opts: any[]) => void; withImage?: boolean }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Opções</Label>
      {options.map((o, i) => (
        <div key={i} className="border rounded p-2 space-y-1">
          <Input className="h-8" placeholder="Label" value={o.label} onChange={(e) => {
            const n = [...options]; n[i] = { ...n[i], label: e.target.value }; onChange(n);
          }} />
          <Input className="h-8 text-xs font-mono" placeholder="value (slug)" value={o.value} onChange={(e) => {
            const n = [...options]; n[i] = { ...n[i], value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }; onChange(n);
          }} />
          {withImage && (
            <Input className="h-8 text-xs" placeholder="URL imagem (opcional)" value={o.image ?? ""} onChange={(e) => {
              const n = [...options]; n[i] = { ...n[i], image: e.target.value }; onChange(n);
            }} />
          )}
          <Button size="sm" variant="ghost" className="text-destructive h-6 text-xs" onClick={() => onChange(options.filter((_, j) => j !== i))}>Remover</Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-full" onClick={() => onChange([...options, { value: `opt_${options.length + 1}`, label: "Nova opção", image: "" }])}>+ Adicionar opção</Button>
    </div>
  );
}

function FaqEditor({ items, onChange }: { items: Array<{ q: string; a: string }>; onChange: (i: any[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="border rounded p-2 space-y-1">
          <Input placeholder="Pergunta" value={it.q} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], q: e.target.value }; onChange(n); }} />
          <Textarea placeholder="Resposta" rows={2} value={it.a} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], a: e.target.value }; onChange(n); }} />
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remover</Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...items, { q: "", a: "" }])}>+ Adicionar</Button>
    </div>
  );
}
