// Painel lateral do contato: foto, nome, status, etiquetas, campos custom, histórico.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchContactProfileFn, updateContactFn } from "@/lib/crm-media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, X, Plus, Mail, Building2, User2, Phone, MessageCircle, Tag } from "lucide-react";
import { toast } from "sonner";

export type ContactConv = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  contact_avatar_url: string | null;
  contact_about: string | null;
  contact_email: string | null;
  contact_company: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  presence: string | null;
  presence_at: string | null;
  last_message_at: string;
};

export function ContactPanel({ conv, onClose }: { conv: ContactConv; onClose: () => void }) {
  const qc = useQueryClient();
  const refreshFn = useServerFn(fetchContactProfileFn);
  const updateFn = useServerFn(updateContactFn);

  const [name, setName] = useState(conv.contact_name ?? "");
  const [email, setEmail] = useState(conv.contact_email ?? "");
  const [company, setCompany] = useState(conv.contact_company ?? "");
  const [tags, setTags] = useState<string[]>(conv.tags ?? []);
  const [newTag, setNewTag] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>(conv.custom_fields ?? {});
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { conversation_id: conv.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-convs"] }); toast.success("Perfil atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => updateFn({ data: {
      conversation_id: conv.id,
      contact_name: name || undefined,
      contact_email: email,
      contact_company: company,
      tags,
      custom_fields: customFields,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-convs"] }); toast.success("Contato salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><User2 className="h-4 w-4 text-primary" /> Contato</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {conv.contact_avatar_url ? (
            <img src={conv.contact_avatar_url} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/30" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary-glow/70 text-2xl font-bold text-primary-foreground">
              {(conv.contact_name ?? conv.contact_phone).slice(-2)}
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`mr-2 h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} /> Atualizar foto/perfil
          </Button>
          {conv.contact_about && (
            <p className="rounded-full bg-muted px-3 py-1 text-xs italic text-muted-foreground">"{conv.contact_about}"</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><User2 className="h-3 w-3" /> Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do contato" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
          <Input value={conv.contact_phone} readOnly className="font-mono text-xs" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Empresa / loja" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Etiquetas</Label>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <form className="flex gap-1" onSubmit={(e) => {
            e.preventDefault();
            const v = newTag.trim();
            if (v && !tags.includes(v)) setTags([...tags, v]);
            setNewTag("");
          }}>
            <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="nova etiqueta" className="h-8 text-xs" />
            <Button size="icon" type="submit" variant="outline" className="h-8 w-8"><Plus className="h-3 w-3" /></Button>
          </form>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Campos personalizados</Label>
          {Object.entries(customFields).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <span className="min-w-[80px] text-xs font-medium">{k}</span>
              <Input value={v} onChange={(e) => setCustomFields({ ...customFields, [k]: e.target.value })} className="h-8 text-xs" />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                const { [k]: _, ...rest } = customFields; setCustomFields(rest);
              }}><X className="h-3 w-3" /></Button>
            </div>
          ))}
          <form className="flex gap-1" onSubmit={(e) => {
            e.preventDefault();
            if (newKey.trim() && newVal.trim()) {
              setCustomFields({ ...customFields, [newKey.trim()]: newVal.trim() });
              setNewKey(""); setNewVal("");
            }
          }}>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="campo" className="h-8 text-xs" />
            <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="valor" className="h-8 text-xs" />
            <Button size="icon" type="submit" variant="outline" className="h-8 w-8"><Plus className="h-3 w-3" /></Button>
          </form>
        </div>

        <div className="rounded-lg border bg-muted/30 p-2 text-xs">
          <div className="mb-1 flex items-center gap-1 font-medium"><MessageCircle className="h-3 w-3" /> Atividade</div>
          <div className="text-muted-foreground">Última mensagem: {new Date(conv.last_message_at).toLocaleString("pt-BR")}</div>
          {conv.presence && (
            <div className="mt-1 text-success">● {conv.presence === "composing" ? "digitando…" : conv.presence === "recording" ? "gravando áudio…" : conv.presence}</div>
          )}
        </div>
      </div>

      <div className="border-t p-3">
        <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>Salvar contato</Button>
      </div>
    </aside>
  );
}
