// Editor de funil — lista de blocos com setas de reordenar + painel de propriedades.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFunnelFn, updateFunnelFn, saveBlocksFn, listContactListsFn,
  upsertDomainFn, removeDomainFn, verifyDomainFn,
} from "@/lib/traffic.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Save, ExternalLink, Globe, Eye } from "lucide-react";
import { FunnelBlockRenderer, type Block } from "@/components/traffic/FunnelBlockRenderer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/traffic/$id/editor")({
  component: EditorPage,
});

const BLOCK_LIBRARY: Array<{ type: string; label: string; defaults: Record<string, unknown> }> = [
  { type: "headline", label: "Título", defaults: { text: "Sua headline aqui", align: "center" } },
  { type: "text", label: "Texto", defaults: { text: "Texto explicativo…", align: "left" } },
  { type: "image", label: "Imagem", defaults: { url: "" } },
  { type: "video", label: "Vídeo (YouTube)", defaults: { url: "" } },
  { type: "button-whatsapp", label: "Botão WhatsApp", defaults: { label: "Falar no WhatsApp", phone: "", message: "Olá!" } },
  { type: "button-link", label: "Botão Link", defaults: { label: "Acessar", url: "" } },
  { type: "button-agenda", label: "Botão Agenda", defaults: { label: "Agendar horário", slug: "" } },
  { type: "form", label: "Formulário", defaults: { title: "Quero saber mais", submitLabel: "Enviar", fields: ["name", "phone"] } },
  { type: "testimonial", label: "Depoimento", defaults: { text: "Adorei o serviço!", author: "Cliente Feliz" } },
  { type: "faq", label: "FAQ", defaults: { items: [{ q: "Pergunta?", a: "Resposta." }] } },
  { type: "spacer", label: "Espaçador", defaults: { height: 24 } },
];

function EditorPage() {
  const { id } = Route.useParams();
  const getFunnel = useServerFn(getFunnelFn);
  const update = useServerFn(updateFunnelFn);
  const saveBlocksRpc = useServerFn(saveBlocksFn);
  const listLists = useServerFn(listContactListsFn);
  const upsertDomain = useServerFn(upsertDomainFn);
  const removeDomain = useServerFn(removeDomainFn);
  const verifyDomain = useServerFn(verifyDomainFn);
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
  const [blocks, setBlocks] = useState<Block[]>(data.blocks as Block[]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // settings form
  const [title, setTitle] = useState(f.title);
  const [primaryColor, setPrimaryColor] = useState(f.primary_color);
  const [fontFamily, setFontFamily] = useState(f.font_family);
  const [seoTitle, setSeoTitle] = useState(f.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(f.seo_description ?? "");
  const [ogImage, setOgImage] = useState(f.og_image_url ?? "");
  const [defaultList, setDefaultList] = useState(f.default_list_id ?? "");
  const settingsObj = (f.settings ?? {}) as { pixel_id?: string; capi_token?: string; ga4_id?: string; gtm_id?: string };
  const [pixelId, setPixelId] = useState(settingsObj.pixel_id ?? "");
  const [capiToken, setCapiToken] = useState(settingsObj.capi_token ?? "");
  const [ga4Id, setGa4Id] = useState(settingsObj.ga4_id ?? "");
  const [gtmId, setGtmId] = useState(settingsObj.gtm_id ?? "");
  const [published, setPublished] = useState(f.status === "published");

  // domain
  const existingDomain = data.domains[0];
  const [customHost, setCustomHost] = useState(existingDomain?.host ?? "");

  useEffect(() => { setDirty(false); }, [data]);

  function markDirty() { setDirty(true); }

  function addBlock(type: string) {
    const def = BLOCK_LIBRARY.find((b) => b.type === type)!;
    const next: Block = { type, position: blocks.length, props: { ...def.defaults } };
    setBlocks([...blocks, next]);
    setSelectedIdx(blocks.length);
    markDirty();
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBlocks(next);
    setSelectedIdx(target);
    markDirty();
  }

  function removeBlock(idx: number) {
    const next = blocks.filter((_, i) => i !== idx);
    setBlocks(next);
    setSelectedIdx(null);
    markDirty();
  }

  function updateBlockProps(idx: number, props: Record<string, unknown>) {
    const next = [...blocks];
    next[idx] = { ...next[idx], props };
    setBlocks(next);
    markDirty();
  }

  async function saveAll() {
    try {
      await update({
        data: {
          id,
          title,
          status: published ? "published" : "draft",
          primary_color: primaryColor,
          font_family: fontFamily,
          seo_title: seoTitle || null,
          seo_description: seoDesc || null,
          og_image_url: ogImage || null,
          default_list_id: defaultList || null,
          settings: {
            pixel_id: pixelId || undefined,
            capi_token: capiToken || undefined,
            ga4_id: ga4Id || undefined,
            gtm_id: gtmId || undefined,
          },
        },
      });
      await saveBlocksRpc({ data: { funnel_id: id, blocks } });
      toast.success("Salvo");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["traffic-funnel", id] });
      qc.invalidateQueries({ queryKey: ["traffic-funnels"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
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

  const selected = selectedIdx !== null ? blocks[selectedIdx] : null;

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

        {/* ============ EDITOR ============ */}
        <TabsContent value="editor">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
            {/* Library */}
            <Card className="p-3 space-y-2 h-fit">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Blocos</h3>
              {BLOCK_LIBRARY.map((b) => (
                <Button key={b.type} variant="outline" size="sm" className="w-full justify-start" onClick={() => addBlock(b.type)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{b.label}
                </Button>
              ))}
            </Card>

            {/* Preview */}
            <Card className="p-4 min-h-[500px]" style={{ fontFamily }}>
              {blocks.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-12">Nenhum bloco. Adicione um do menu à esquerda.</p>
              )}
              <div className="mx-auto max-w-xl space-y-4">
                {blocks.map((b, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`relative group rounded-lg p-3 cursor-pointer transition ${selectedIdx === i ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
                  >
                    <FunnelBlockRenderer block={b} funnelSlug={f.slug} primaryColor={primaryColor} trackEvent={() => {}} />
                    <div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 bg-background border rounded-md p-0.5 shadow">
                      <button onClick={(e) => { e.stopPropagation(); move(i, -1); }} className="p-1 hover:bg-muted rounded" title="Subir"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); move(i, 1); }} className="p-1 hover:bg-muted rounded" title="Descer"><ArrowDown className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeBlock(i); }} className="p-1 hover:bg-destructive/10 text-destructive rounded" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Props */}
            <Card className="p-3 h-fit space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Propriedades</h3>
              {!selected && <p className="text-xs text-muted-foreground">Selecione um bloco para editar.</p>}
              {selected && <BlockPropsEditor block={selected} onChange={(p) => updateBlockProps(selectedIdx!, p)} />}
            </Card>
          </div>
        </TabsContent>

        {/* ============ DESIGN ============ */}
        <TabsContent value="design">
          <Card className="p-4 max-w-xl space-y-4">
            <div>
              <Label>Título do funil</Label>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} />
            </div>
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
          </Card>
        </TabsContent>

        {/* ============ TRACKING ============ */}
        <TabsContent value="tracking">
          <Card className="p-4 max-w-2xl space-y-4">
            <div>
              <h3 className="font-semibold">Facebook Pixel + CAPI</h3>
              <p className="text-xs text-muted-foreground">Dispara eventos no client e também via servidor (deduplicação automática).</p>
            </div>
            <div>
              <Label>Pixel ID</Label>
              <Input value={pixelId} onChange={(e) => { setPixelId(e.target.value); markDirty(); }} placeholder="1234567890" />
            </div>
            <div>
              <Label>Conversions API Token</Label>
              <Input type="password" value={capiToken} onChange={(e) => { setCapiToken(e.target.value); markDirty(); }} placeholder="EAAB…" />
              <p className="mt-1 text-[11px] text-muted-foreground">Gere em Eventos Manager → Configurações → Conversions API → Token de acesso.</p>
            </div>
            <div className="border-t pt-4">
              <h3 className="font-semibold">Google Analytics 4 / GTM</h3>
            </div>
            <div>
              <Label>GA4 Measurement ID</Label>
              <Input value={ga4Id} onChange={(e) => { setGa4Id(e.target.value); markDirty(); }} placeholder="G-XXXXXXXXXX" />
            </div>
            <div>
              <Label>GTM Container ID</Label>
              <Input value={gtmId} onChange={(e) => { setGtmId(e.target.value); markDirty(); }} placeholder="GTM-XXXXXX" />
            </div>
          </Card>
        </TabsContent>

        {/* ============ LEADS ============ */}
        <TabsContent value="lead">
          <Card className="p-4 max-w-xl space-y-4">
            <div>
              <Label>Lista CRM padrão (para onde vão os leads capturados)</Label>
              <Select value={defaultList || "__none__"} onValueChange={(v) => { setDefaultList(v === "__none__" ? "" : v); markDirty(); }}>
                <SelectTrigger><SelectValue placeholder="Sem lista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem lista (só registra no funil)</SelectItem>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>
        </TabsContent>

        {/* ============ DOMAIN ============ */}
        <TabsContent value="domain">
          <Card className="p-4 max-w-2xl space-y-4">
            <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><h3 className="font-semibold">Domínio próprio</h3></div>
            <p className="text-xs text-muted-foreground">
              Use seu próprio domínio para rodar Facebook Ads sem queimar reputação. Recomendamos colocar o Cloudflare (grátis) na frente do seu DNS.
            </p>
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
                  <div>
                    <strong>1) CNAME</strong><br />
                    Nome: <code>{existingDomain.host.split(".")[0]}</code><br />
                    Aponta para: <code>zapblastapi.lovable.app</code>
                  </div>
                  <div>
                    <strong>2) TXT</strong><br />
                    Nome: <code>_zapblast-verify.{existingDomain.host.split(".")[0]}</code><br />
                    Valor: <code>{existingDomain.verify_token}</code>
                  </div>
                  <p className="font-sans text-muted-foreground">Após salvar no seu provedor de DNS, clique em "Verificar". O SSL é gerenciado pelo Cloudflare que você colocar na frente do seu domínio.</p>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ============ SEO ============ */}
        <TabsContent value="seo">
          <Card className="p-4 max-w-xl space-y-4">
            <div><Label>Título SEO</Label><Input value={seoTitle} onChange={(e) => { setSeoTitle(e.target.value); markDirty(); }} /></div>
            <div><Label>Descrição SEO</Label><Textarea value={seoDesc} onChange={(e) => { setSeoDesc(e.target.value); markDirty(); }} rows={3} /></div>
            <div><Label>OG Image URL (1200x630)</Label><Input value={ogImage} onChange={(e) => { setOgImage(e.target.value); markDirty(); }} /></div>
          </Card>
        </TabsContent>

        {/* ============ PUBLISH ============ */}
        <TabsContent value="publish">
          <Card className="p-4 max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Publicar funil</Label>
                <p className="text-xs text-muted-foreground">Quando publicado, fica acessível em /f/{f.slug}</p>
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

/* ============================================== */
function BlockPropsEditor({ block, onChange }: { block: Block; onChange: (p: Record<string, unknown>) => void }) {
  const p = block.props as Record<string, unknown>;
  const setProp = (k: string, v: unknown) => onChange({ ...p, [k]: v });

  if (["headline", "text"].includes(block.type)) {
    return (
      <div className="space-y-2">
        <Label>Texto</Label>
        <Textarea value={(p.text as string) ?? ""} onChange={(e) => setProp("text", e.target.value)} rows={4} />
        <Label>Alinhamento</Label>
        <Select value={(p.align as string) ?? "left"} onValueChange={(v) => setProp("align", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Esquerda</SelectItem>
            <SelectItem value="center">Centro</SelectItem>
            <SelectItem value="right">Direita</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <div className="space-y-2">
        <Label>URL da imagem</Label>
        <Input value={(p.url as string) ?? ""} onChange={(e) => setProp("url", e.target.value)} />
        <Label>Alt</Label>
        <Input value={(p.alt as string) ?? ""} onChange={(e) => setProp("alt", e.target.value)} />
      </div>
    );
  }
  if (block.type === "video") {
    return (
      <div className="space-y-2">
        <Label>URL do YouTube</Label>
        <Input value={(p.url as string) ?? ""} onChange={(e) => setProp("url", e.target.value)} placeholder="https://youtu.be/…" />
      </div>
    );
  }
  if (block.type === "button-whatsapp") {
    return (
      <div className="space-y-2">
        <Label>Texto do botão</Label>
        <Input value={(p.label as string) ?? ""} onChange={(e) => setProp("label", e.target.value)} />
        <Label>Telefone (com DDD/DDI)</Label>
        <Input value={(p.phone as string) ?? ""} onChange={(e) => setProp("phone", e.target.value)} placeholder="5511999999999" />
        <Label>Mensagem inicial</Label>
        <Textarea value={(p.message as string) ?? ""} onChange={(e) => setProp("message", e.target.value)} rows={2} />
      </div>
    );
  }
  if (block.type === "button-link") {
    return (
      <div className="space-y-2">
        <Label>Texto do botão</Label>
        <Input value={(p.label as string) ?? ""} onChange={(e) => setProp("label", e.target.value)} />
        <Label>URL</Label>
        <Input value={(p.url as string) ?? ""} onChange={(e) => setProp("url", e.target.value)} />
      </div>
    );
  }
  if (block.type === "button-agenda") {
    return (
      <div className="space-y-2">
        <Label>Texto do botão</Label>
        <Input value={(p.label as string) ?? ""} onChange={(e) => setProp("label", e.target.value)} />
        <Label>Slug do negócio (Agenda)</Label>
        <Input value={(p.slug as string) ?? ""} onChange={(e) => setProp("slug", e.target.value)} placeholder="meu-negocio" />
      </div>
    );
  }
  if (block.type === "form") {
    const fields = (p.fields as string[]) ?? [];
    function toggleField(f: string) {
      setProp("fields", fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f]);
    }
    return (
      <div className="space-y-2">
        <Label>Título</Label>
        <Input value={(p.title as string) ?? ""} onChange={(e) => setProp("title", e.target.value)} />
        <Label>Texto do botão</Label>
        <Input value={(p.submitLabel as string) ?? ""} onChange={(e) => setProp("submitLabel", e.target.value)} />
        <Label>Campos</Label>
        <div className="flex flex-col gap-1 text-sm">
          {["name", "phone", "email"].map((fld) => (
            <label key={fld} className="flex items-center gap-2">
              <input type="checkbox" checked={fields.includes(fld)} onChange={() => toggleField(fld)} />
              {fld}
            </label>
          ))}
        </div>
        <Label>Mensagem de sucesso (título)</Label>
        <Input value={(p.successTitle as string) ?? ""} onChange={(e) => setProp("successTitle", e.target.value)} />
        <Label>Mensagem de sucesso (texto)</Label>
        <Input value={(p.successText as string) ?? ""} onChange={(e) => setProp("successText", e.target.value)} />
      </div>
    );
  }
  if (block.type === "testimonial") {
    return (
      <div className="space-y-2">
        <Label>Depoimento</Label>
        <Textarea value={(p.text as string) ?? ""} onChange={(e) => setProp("text", e.target.value)} rows={3} />
        <Label>Autor</Label>
        <Input value={(p.author as string) ?? ""} onChange={(e) => setProp("author", e.target.value)} />
      </div>
    );
  }
  if (block.type === "faq") {
    const items = (p.items as Array<{ q: string; a: string }>) ?? [];
    return (
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="border rounded p-2 space-y-1">
            <Input placeholder="Pergunta" value={it.q} onChange={(e) => {
              const next = [...items]; next[i] = { ...next[i], q: e.target.value }; setProp("items", next);
            }} />
            <Textarea placeholder="Resposta" value={it.a} rows={2} onChange={(e) => {
              const next = [...items]; next[i] = { ...next[i], a: e.target.value }; setProp("items", next);
            }} />
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setProp("items", items.filter((_, j) => j !== i))}>
              Remover
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setProp("items", [...items, { q: "", a: "" }])}>+ Adicionar</Button>
      </div>
    );
  }
  if (block.type === "spacer") {
    return (
      <div className="space-y-2">
        <Label>Altura (px)</Label>
        <Input type="number" value={(p.height as number) ?? 24} onChange={(e) => setProp("height", Number(e.target.value))} />
      </div>
    );
  }
  return null;
}
