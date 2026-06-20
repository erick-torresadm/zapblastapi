import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Loader2, Save, User2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

type Profile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  avatar_url: string | null;
};

async function refreshAvatarSignedUrl(path: string | null) {
  if (!path) return null;
  // If already a full URL, return as-is.
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 30);
  return data?.signedUrl ?? null;
}

function ProfilePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Profile | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, phone, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // Ensure a profile row exists for editing.
        const { data: created } = await supabase
          .from("profiles")
          .insert({ id: user.id })
          .select("id, full_name, company_name, phone, avatar_url")
          .single();
        return created as Profile;
      }
      return data as Profile;
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar-signed", profile?.avatar_url],
    enabled: !!profile,
    queryFn: () => refreshAvatarSignedUrl(profile?.avatar_url ?? null),
  });

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCompanyName(profile.company_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 3MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.id);
      if (updErr) throw updErr;
      await qc.invalidateQueries({ queryKey: ["profile", user.id] });
      await qc.invalidateQueries({ queryKey: ["avatar-signed"] });
      await qc.invalidateQueries({ queryKey: ["profile-avatar-sidebar"] });
      toast.success("Foto atualizada!");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          company_name: companyName.trim() || null,
          phone: phone.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("Dados salvos.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const initials = (fullName || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User2 className="h-6 w-6 text-primary" />
          Meu perfil
        </h1>
        <p className="text-muted-foreground">Personalize sua foto e seus dados de contato.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto de perfil</CardTitle>
          <CardDescription>Aparece no menu lateral e nas conversas com sua equipe.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="h-24 w-24 ring-2 ring-primary/20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName || "Avatar"} />}
            <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary-glow/80 text-primary-foreground text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="outline">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {uploading ? "Enviando…" : "Trocar foto"}
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP. Até 3MB.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
          <CardDescription>Usados em comunicações e cobranças.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">Para trocar o e-mail, fale com o suporte.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nome da sua empresa" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">WhatsApp / Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar alterações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
