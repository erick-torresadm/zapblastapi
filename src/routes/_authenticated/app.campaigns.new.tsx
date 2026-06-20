import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { previewSpintax } from "@/lib/spintax";
import { formatPhone } from "@/lib/format-instance";

export const Route = createFileRoute("/_authenticated/app/campaigns/new")({ component: NewCampaign });

function NewCampaign() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: "",
    list_id: "",
    message_template: "",
    min_delay_s: 15,
    max_delay_s: 60,
    instance_ids: [] as string[],
    scheduled_for: "",
    media_url: "" as string | null,
    media_type: null as string | null,
    media_filename: null as string | null,
    flow_id: "" as string,
  });
  const [mediaUploading, setMediaUploading] = useState(false);

  const { data: lists } = useQuery({
    queryKey: ["lists-min"],
    queryFn: async () => (await supabase.from("contact_lists").select("id,name,total_count")).data ?? [],
  });
  const { data: instances } = useQuery({
    queryKey: ["instances-connected"],
    queryFn: async () => (await supabase.from("whatsapp_instances").select("id,instance_name,phone_number,status").eq("active", true)).data ?? [],
  });
  const { data: flows } = useQuery({
    queryKey: ["flows-active"],
    queryFn: async () => (await supabase.from("flows").select("id,name,status").order("updated_at", { ascending: false })).data ?? [],
  });

  const previews = useMemo(() => {
    if (!form.message_template) return [];
    const sample = { nome: "João", empresa: "Acme", primeiro_nome: "João" };
    return previewSpintax(form.message_template, sample, 5);
  }, [form.message_template]);

  async function uploadMedia(file: File) {
    setMediaUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMediaUploading(false); return; }
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("campaign-media").upload(path, file);
    if (error) { toast.error(error.message); setMediaUploading(false); return; }
    const { data: signed } = await supabase.storage.from("campaign-media").createSignedUrl(path, 60 * 60 * 24 * 30);
    const t = file.type.startsWith("image/") ? "image"
      : file.type.startsWith("video/") ? "video"
      : file.type.startsWith("audio/") ? "audio" : "document";
    setForm((f) => ({ ...f, media_url: signed?.signedUrl ?? null, media_type: t, media_filename: file.name }));
    setMediaUploading(false);
    toast.success("Mídia anexada");
  }

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      if (!form.name || !form.list_id || form.instance_ids.length === 0) {
        throw new Error("Preencha nome, lista e chips");
      }
      if (!form.message_template && !form.flow_id) {
        throw new Error("Defina uma mensagem OU selecione um fluxo");
      }

      const { data, error } = await supabase.from("campaigns").insert({
        user_id: user.id,
        name: form.name,
        list_id: form.list_id,
        message_template: form.message_template || null,
        min_delay_s: form.min_delay_s,
        max_delay_s: form.max_delay_s,
        instance_ids: form.instance_ids,
        scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
        media_url: form.media_url,
        media_type: form.media_type,
        media_filename: form.media_filename,
        flow_id: form.flow_id || null,
        status: "draft",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => { toast.success("Rascunho criado. Inicie pela tela de campanhas."); nav({ to: "/app/campaigns/$id", params: { id: c.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nova campanha</h1>
        <p className="text-sm text-muted-foreground">Configure e crie como rascunho. Inicie depois.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Básico</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nome da campanha</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Lista de contatos</Label>
            <Select value={form.list_id} onValueChange={(v) => setForm({ ...form, list_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{lists?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} ({l.total_count})</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Mensagem (opcional se houver fluxo)</CardTitle>
          <CardDescription>
            Deixe vazio para usar a 1ª mensagem do fluxo. Spintax: <code>{`{Oi|Olá|E aí}`}</code> • variáveis: <code>{`{{nome}}`}</code>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Textarea
            rows={6}
            placeholder="{Oi|Olá|E aí} {{nome}}, tudo bem? Quero te apresentar nossa promoção..."
            value={form.message_template}
            onChange={(e) => setForm({ ...form, message_template: e.target.value })}
          />
          {previews.length > 0 && (
            <div className="rounded border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">5 VARIAÇÕES GERADAS:</p>
              <ul className="space-y-1 text-sm">{previews.map((p, i) => <li key={i}>• {p}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Mídia (opcional)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" accept="image/*,video/*,audio/*,application/pdf" disabled={mediaUploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); }} />
          {form.media_url && <p className="text-xs text-muted-foreground">Anexado: {form.media_filename} ({form.media_type})</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Fluxo automatizado (opcional)</CardTitle>
          <CardDescription>Após enviar a mensagem inicial, cada contato entra neste fluxo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={form.flow_id || "none"} onValueChange={(v) => setForm({ ...form, flow_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Sem fluxo (só mensagem única)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem fluxo (só mensagem única)</SelectItem>
              {flows?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} {f.status === "active" ? "" : `(${f.status})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {flows?.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Nenhum fluxo criado ainda. Crie em Fluxos.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>5. Chips e timing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Chips a usar (rotação round-robin)</Label>
            <div className="mt-2 space-y-2">
              {instances?.length ? instances.map((i) => (
                <label key={i.id} className="flex items-center gap-2 rounded border p-2">
                  <Checkbox
                    checked={form.instance_ids.includes(i.id)}
                    onCheckedChange={(c) => setForm((f) => ({
                      ...f,
                      instance_ids: c ? [...f.instance_ids, i.id] : f.instance_ids.filter((x) => x !== i.id),
                    }))}
                  />
                  <span className="font-medium">{i.instance_name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone((i as any).phone_number)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{i.status}</span>
                </label>
              )) : <p className="text-sm text-muted-foreground">Nenhum chip cadastrado.</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Delay mín. (s)</Label><Input type="number" min={1} value={form.min_delay_s} onChange={(e) => setForm({ ...form, min_delay_s: Number(e.target.value) })} /></div>
            <div><Label>Delay máx. (s)</Label><Input type="number" min={1} value={form.max_delay_s} onChange={(e) => setForm({ ...form, max_delay_s: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>Agendar para (opcional)</Label>
            <Input type="datetime-local" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/app/campaigns" })}>Cancelar</Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>Criar rascunho</Button>
      </div>
    </div>
  );
}
