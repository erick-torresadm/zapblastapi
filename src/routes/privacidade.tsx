import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade · Perseidas" },
      { name: "description", content: "Como a Perseidas trata seus dados e os limites de responsabilidade no uso de API não oficial do WhatsApp." },
      { property: "og:title", content: "Política de Privacidade · Perseidas" },
      { property: "og:description", content: "Como a Perseidas trata seus dados e os limites de responsabilidade no uso de API não oficial do WhatsApp." },
      { property: "og:url", content: "https://zapblastapi.lovable.app/privacidade" },
      { property: "og:locale", content: "pt_BR" },
    ],
    links: [{ rel: "canonical", href: "https://zapblastapi.lovable.app/privacidade" }],
  }),
});


function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: 19 de junho de 2026</p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Quem somos</h2>
            <p>A Perseidas é uma plataforma de automação de mensagens via WhatsApp que oferece disparos, fluxos, CRM e aquecimento de chips. Este documento descreve como tratamos as informações dos nossos usuários e dos contatos com os quais eles se comunicam.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Dados que coletamos</h2>
            <ul className="ml-6 list-disc space-y-1">
              <li><strong>Cadastro:</strong> nome, e-mail, telefone e dados de pagamento (processados por gateways parceiros).</li>
              <li><strong>Operacionais:</strong> instâncias conectadas, números utilizados, mensagens enviadas/recebidas, mídias, contatos, tags e logs de uso da plataforma.</li>
              <li><strong>Técnicos:</strong> IP, navegador, sistema operacional, cookies essenciais de sessão.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Como usamos seus dados</h2>
            <p>Utilizamos as informações exclusivamente para prestar o serviço contratado: rotear mensagens, manter sessões ativas, exibir histórico no CRM, gerar relatórios, faturar planos e oferecer suporte. Não vendemos nem alugamos seus dados a terceiros.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Conteúdo das conversas</h2>
            <p>As mensagens trafegam pelas nossas instâncias para que o CRM e os fluxos funcionem. Armazenamos esse conteúdo enquanto a conta estiver ativa para que você consiga consultar o histórico. <strong>Você é o controlador desses dados</strong> e é responsável por obter o consentimento dos seus contatos, cumprir a LGPD/GDPR e as políticas locais aplicáveis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Sobre o uso de API não oficial — leia com atenção</h2>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-amber-100/90">
              <p><strong>A Perseidas opera sobre uma API simulada (não oficial) do WhatsApp.</strong> Nenhuma solução baseada em API não oficial — incluindo a nossa, a dos nossos concorrentes ou qualquer projeto open-source equivalente — pode garantir que um número de WhatsApp não será banido, bloqueado, desconectado ou limitado pela Meta/WhatsApp.</p>
              <p className="mt-3">Aplicamos as melhores práticas do mercado (aquecimento automático, intervalos humanizados, rotação, limites por chip, anti-fingerprint) e por isso somos, em desempenho de entrega, referência no segmento. Ainda assim, <strong>o risco de queda do número existe e é inerente à tecnologia</strong>. Ao contratar, você reconhece e aceita esse risco.</p>
              <p className="mt-3">Se você precisa de garantia contratual de não-banimento, a única alternativa é a <strong>API oficial do WhatsApp Business (Cloud API)</strong>, oferecida diretamente pela Meta sob regras próprias — fora do escopo do nosso produto atual.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Limitação de responsabilidade</h2>
            <p><strong>A Perseidas não se responsabiliza</strong> por: (a) banimento, bloqueio temporário ou definitivo de números de WhatsApp conectados à plataforma; (b) perda de contatos, conversas ou mídia decorrente desses bloqueios; (c) prejuízos comerciais indiretos resultantes de instabilidade da rede do WhatsApp; (d) uso da plataforma em desacordo com os Termos do WhatsApp, com a LGPD ou com a legislação aplicável ao seu país.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Compartilhamento</h2>
            <p>Compartilhamos dados apenas com provedores essenciais à operação (hospedagem, banco de dados, processadores de pagamento, provedores de e-mail) sob contrato e dentro do necessário para entregar o serviço.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Retenção e exclusão</h2>
            <p>Mantemos seus dados enquanto a conta estiver ativa. Você pode solicitar exportação ou exclusão a qualquer momento pelo e-mail de suporte. Após o encerramento, dados são removidos em até 30 dias, ressalvadas obrigações legais de retenção (fiscais, por exemplo).</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Segurança</h2>
            <p>Usamos criptografia em trânsito (TLS), controles de acesso por função e isolamento por tenant. Nenhum sistema é 100% inviolável — recomendamos senhas fortes e ativação de autenticação em duas etapas quando disponível.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Contato</h2>
            <p>Dúvidas sobre privacidade: <span className="text-foreground">suporte@perseidas.app</span>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
