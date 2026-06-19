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
  const checkIp = useServerFn(checkSignupIpFn);
  const recordIp = useServerFn(recordSignupIpFn);

  const nextPath = (() => {
    if (typeof window === "undefined") return "/app";
    const p = new URLSearchParams(window.location.search).get("next");
    return p && p.startsWith("/") ? p : "/app";
  })();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: nextPath, replace: true });
    });
  }, [nav, nextPath]);


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
    nav({ to: nextPath, replace: true });
  }

  async function signUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const name = String(fd.get("name") ?? "");
    if (password.length < 4) return toast.error("A senha precisa ter ao menos 4 caracteres.");

    setLoading(true);
    try {
      // 1) Bloqueia múltiplos cadastros do mesmo IP
      const ipCheck = await checkIp();
      if (!ipCheck.ok) { setLoading(false); return toast.error(ipCheck.reason); }

      // 2) Cria conta (sem confirmação de e-mail — auto-login)
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } },
      });
      if (error) { setLoading(false); return toast.error(error.message); }

      // 3) Registra IP do novo usuário
      try { await recordIp(); } catch (e) { console.warn("[signup] recordIp falhou", e); }

      setLoading(false);
      toast.success("🎉 Conta criada! Seu teste Pro de 7 dias começou agora.", {
        description: "Você ganhou acesso completo: 20 chips, 5.000 mensagens/dia e aquecimento ilimitado.",
        duration: 6000,
      });
      nav({ to: nextPath, replace: true });
    } catch (e) {
      setLoading(false);
      toast.error((e as Error).message);
    }
  }


  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + nextPath });
    if (result.error) { setLoading(false); toast.error("Erro ao entrar com Google"); return; }
    if (result.redirected) return;
    nav({ to: nextPath, replace: true });
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
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">7 dias grátis no plano Pro</div>
                      <div className="text-muted-foreground">20 chips, 5.000 mensagens/dia, aquecimento ilimitado. Sem cartão.</div>
                    </div>
                  </div>
                  <form onSubmit={signUp} className="space-y-4">
                    <div><Label htmlFor="su-name">Nome</Label><Input id="su-name" name="name" required className="mt-1.5" /></div>
                    <div><Label htmlFor="su-email">E-mail</Label><Input id="su-email" name="email" type="email" required autoComplete="email" className="mt-1.5" /></div>
                    <div>
                      <Label htmlFor="su-pwd">Senha</Label>
                      <Input id="su-pwd" name="password" type="password" required autoComplete="new-password" className="mt-1.5" />
                      <p className="mt-1 text-[11px] text-muted-foreground">Mínimo 4 caracteres. Use o que for fácil de lembrar.</p>
                    </div>
                    <Button type="submit" className="w-full bg-gradient-to-br from-primary to-primary-glow shadow-glow" disabled={loading}>Começar 7 dias grátis</Button>
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
