import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/termos")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Termos de Uso · Perseidas" },
      { name: "description", content: "Termos de uso da Perseidas, incluindo limites de responsabilidade sobre banimento de números do WhatsApp em API não oficial." },
      { property: "og:title", content: "Termos de Uso · Perseidas" },
      { property: "og:description", content: "Termos de uso da Perseidas e limites de responsabilidade sobre banimento de números do WhatsApp em API não oficial." },
      { property: "og:url", content: "https://zapblastapi.lovable.app/termos" },
      { property: "og:locale", content: "pt_BR" },
    ],
    links: [{ rel: "canonical", href: "https://zapblastapi.lovable.app/termos" }],
  }),
});


function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 19 de junho de 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Aceitação</h2>
            <p>Ao criar uma conta, conectar um número ou utilizar qualquer recurso da Perseidas, você declara ter lido, compreendido e aceito integralmente estes Termos e a nossa <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Natureza do serviço</h2>
            <p>A Perseidas fornece uma plataforma SaaS que automatiza o envio e o recebimento de mensagens via WhatsApp por meio de <strong>API simulada (não oficial)</strong>. Não somos afiliados, parceiros, representantes ou licenciados da Meta Platforms, Inc. ou do WhatsApp LLC.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Risco de banimento — cláusula essencial</h2>
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-foreground">
              <p><strong>Nenhuma forma de API não oficial do WhatsApp garante que o número não será banido, bloqueado ou desconectado.</strong> Isso vale para a Perseidas e para qualquer outra ferramenta do mercado, sem exceção. O WhatsApp pode, a qualquer momento e a seu exclusivo critério, suspender números que utilizem automação fora da Cloud API oficial.</p>
              <p className="mt-3">Você reconhece que:</p>
              <ul className="ml-6 mt-2 list-disc space-y-1">
                <li>Investimos pesadamente em mecanismos anti-ban (aquecimento, humanização, rotação, limites adaptativos) e por isso temos uma das maiores taxas de sobrevivência de chip do mercado;</li>
                <li>Ainda assim, <strong>existe uma chance real de queda do número</strong> e isso é parte do risco operacional que você assume ao optar por essa tecnologia;</li>
                <li>A Perseidas <strong>não oferece, sob nenhuma hipótese, garantia de não-banimento</strong>, reembolso por números banidos, ressarcimento por contatos perdidos ou indenização por lucros cessantes decorrentes de bloqueios aplicados pelo WhatsApp.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Limitação de responsabilidade</h2>
            <p>Na máxima extensão permitida pela lei, a Perseidas, seus sócios, funcionários e parceiros <strong>não se responsabilizam</strong> por:</p>
            <ul className="ml-6 mt-2 list-disc space-y-1">
              <li>Banimento, suspensão ou bloqueio de números de WhatsApp;</li>
              <li>Perda de contatos, conversas, mídias, áudios ou históricos vinculados a um número bloqueado pelo WhatsApp;</li>
              <li>Lucros cessantes, danos indiretos, perda de oportunidade comercial ou impacto reputacional;</li>
              <li>Indisponibilidades da rede do WhatsApp, alterações em seus protocolos ou mudanças unilaterais em suas políticas;</li>
              <li>Uso da plataforma em desacordo com estes Termos, com os Termos do WhatsApp, com a LGPD ou com a legislação local;</li>
              <li>Conteúdo enviado pelo usuário aos seus contatos, incluindo spam, fraude ou material ilícito.</li>
            </ul>
            <p className="mt-3">Em qualquer hipótese de responsabilização legalmente reconhecida, o valor máximo agregado da nossa responsabilidade fica limitado ao total efetivamente pago pelo usuário nos 3 (três) meses anteriores ao evento.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Uso permitido</h2>
            <ul className="ml-6 list-disc space-y-1">
              <li>É proibido enviar spam, conteúdo ilegal, discurso de ódio, fraude, phishing ou material adulto não consentido;</li>
              <li>É obrigatório obter consentimento (opt-in) dos contatos antes de incluí-los em campanhas;</li>
              <li>É proibido revender acesso à plataforma sem autorização escrita.</li>
            </ul>
            <p className="mt-3">O descumprimento autoriza a Perseidas a suspender ou encerrar a conta sem reembolso.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Pagamentos e cancelamento</h2>
            <p>Planos são cobrados conforme o ciclo escolhido. Você pode cancelar a qualquer momento e o acesso permanece ativo até o fim do período pago. Não há reembolso proporcional, exceto quando exigido por lei (CDC, art. 49, para a primeira contratação dentro de 7 dias).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Alterações</h2>
            <p>Estes Termos podem ser atualizados. Mudanças relevantes serão comunicadas por e-mail ou no painel com pelo menos 15 dias de antecedência. O uso continuado após a vigência implica aceitação.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Foro</h2>
            <p>Fica eleito o foro da comarca da sede da Perseidas para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Contato</h2>
            <p>Dúvidas sobre estes termos: <span className="text-foreground">suporte@perseidas.app</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
