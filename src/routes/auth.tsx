import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { checkSignupIpFn, recordSignupIpFn } from "@/lib/signup-guard.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Perseidas" }, { name: "description", content: "Acesse sua conta Perseidas" }] }),
  component: AuthPage,
});


function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/app", replace: true });
    });
  }, [nav]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    nav({ to: "/app", replace: true });
  }

  async function signUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: window.location.origin + "/app",
        data: { full_name: String(fd.get("name") ?? "") },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já está logado.");
    nav({ to: "/app", replace: true });
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/app" });
    if (result.error) { setLoading(false); toast.error("Erro ao entrar com Google"); return; }
    if (result.redirected) return;
    nav({ to: "/app", replace: true });
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Decorative panel */}
      <div className="relative hidden overflow-hidden lg:block" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage:
            "radial-gradient(circle at 25% 30%, oklch(0.62 0.21 275 / 0.5), transparent 40%), radial-gradient(circle at 75% 70%, oklch(0.72 0.18 300 / 0.4), transparent 40%)",
        }} />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo to="/" size="lg" />
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">
              Dispare no WhatsApp <br />
              <span className="text-aurora">sem queimar chips.</span>
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">
              Anti-ban Engine, aquecimento automático, marketplace de chips BR. Tudo no mesmo painel.
            </p>
            <div className="mt-8 space-y-2.5 text-sm">
              {["Evolution API nativa", "Aquecimento bidirecional", "Marketplace de chips BR", "Suporte humano"].map((x) => (
                <div key={x} className="flex items-center gap-2 text-muted-foreground">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success">✓</div>
                  {x}
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">© 2026 Perseidas · Anti-ban Suite</div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <Logo to="/" size="lg" />
          </div>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Acessar plataforma</CardTitle>
              <CardDescription>Entre ou crie sua conta para começar</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5">
                  <form onSubmit={signIn} className="space-y-4">
                    <div><Label htmlFor="si-email">E-mail</Label><Input id="si-email" name="email" type="email" required autoComplete="email" className="mt-1.5" /></div>
                    <div><Label htmlFor="si-pwd">Senha</Label><Input id="si-pwd" name="password" type="password" required autoComplete="current-password" className="mt-1.5" /></div>
                    <Button type="submit" className="w-full bg-gradient-to-br from-primary to-primary-glow shadow-glow" disabled={loading}>Entrar</Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-5">
                  <form onSubmit={signUp} className="space-y-4">
                    <div><Label htmlFor="su-name">Nome</Label><Input id="su-name" name="name" required className="mt-1.5" /></div>
                    <div><Label htmlFor="su-email">E-mail</Label><Input id="su-email" name="email" type="email" required autoComplete="email" className="mt-1.5" /></div>
                    <div><Label htmlFor="su-pwd">Senha</Label><Input id="su-pwd" name="password" type="password" required minLength={6} autoComplete="new-password" className="mt-1.5" /></div>
                    <Button type="submit" className="w-full bg-gradient-to-br from-primary to-primary-glow shadow-glow" disabled={loading}>Criar conta</Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="my-5 flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">OU</span><div className="h-px flex-1 bg-border" /></div>
              <Button variant="outline" className="w-full border-border/60 bg-background/40" onClick={google} disabled={loading}>Continuar com Google</Button>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Ao continuar você concorda com nossos Termos e Política de Privacidade.
          </p>
        </div>
      </div>
    </div>
  );
}
