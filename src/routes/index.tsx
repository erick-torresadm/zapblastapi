import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Zap, Shuffle, Shield, MessageSquare, BarChart3, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapBlast — Disparo em massa de WhatsApp com rotação de chips" },
      { name: "description", content: "Dispare campanhas de WhatsApp com rotação inteligente entre múltiplos chips. Anti-ban, spintax, agendamento e relatórios — 10x mais barato que a API oficial." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <span className="font-bold">ZapBlast</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Entrar</Link></Button>
            <Button asChild><Link to="/auth">Criar conta</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-24 text-center">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-5xl font-bold tracking-tight md:text-6xl">
              Dispare em massa no WhatsApp <span className="text-primary">sem queimar chips</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Conecte sua Evolution API, cadastre vários chips e dispare campanhas com rotação inteligente, delays humanos e spintax. Custo 10x menor que a API oficial.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg"><Link to="/auth">Começar grátis</Link></Button>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Shuffle, title: "Rotação de chips", desc: "Distribui mensagens entre todos os números conectados em round-robin." },
              { icon: Shield, title: "Anti-ban embutido", desc: "Delay aleatório, limite diário por chip e spintax para evitar filtros." },
              { icon: MessageSquare, title: "Spintax + variáveis", desc: "{Oi|Olá|E aí} {{nome}} — cada envio é único, igual humano." },
              { icon: Clock, title: "Agendamento", desc: "Programe campanhas para o melhor horário e deixe rodar." },
              { icon: BarChart3, title: "Relatórios", desc: "Acompanhe entregues, lidas e respostas em tempo real." },
              { icon: Zap, title: "Evolution API", desc: "Use seu próprio servidor Evolution. Sem limites, sem mensalidade absurda." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © 2026 ZapBlast
      </footer>
    </div>
  );
}
