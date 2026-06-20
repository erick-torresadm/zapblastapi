// Definição central dos tipos de bloco disponíveis no editor.
export type BlockDef = {
  type: string;
  label: string;
  category: "basic" | "media" | "input" | "conversion" | "advanced";
  icon: string; // lucide name
  defaults: Record<string, unknown>;
  hasFieldKey?: boolean; // se gera resposta
};

export const BLOCK_LIBRARY: BlockDef[] = [
  // Essenciais
  { type: "headline", label: "Título", category: "basic", icon: "Heading1",
    defaults: { text: "Sua headline aqui", align: "center", size: "xl" } },
  { type: "text", label: "Texto", category: "basic", icon: "Type",
    defaults: { text: "Texto explicativo…", align: "left" } },
  { type: "image", label: "Imagem", category: "basic", icon: "Image",
    defaults: { url: "", alt: "", rounded: true } },
  { type: "divider", label: "Divisor", category: "basic", icon: "Minus",
    defaults: {} },
  { type: "spacer", label: "Espaçador", category: "basic", icon: "MoveVertical",
    defaults: { height: 24 } },

  // Inputs / escolhas
  { type: "choice", label: "Escolha única (cards)", category: "input", icon: "ListChecks",
    hasFieldKey: true,
    defaults: {
      label: "Selecione uma opção",
      options: [
        { value: "a", label: "Opção A", image: "" },
        { value: "b", label: "Opção B", image: "" },
      ],
      layout: "grid", // grid | list
      autoNext: true,
    } },
  { type: "multi-choice", label: "Escolha múltipla", category: "input", icon: "CheckSquare",
    hasFieldKey: true,
    defaults: {
      label: "Selecione todas que se aplicam",
      options: [
        { value: "a", label: "Opção A" },
        { value: "b", label: "Opção B" },
      ],
      min: 0, max: 0,
    } },
  { type: "input", label: "Campo de entrada", category: "input", icon: "TextCursorInput",
    hasFieldKey: true,
    defaults: { label: "Sua resposta", placeholder: "", inputType: "text", required: true } },

  // Mídia
  { type: "video", label: "Vídeo (YouTube/Vimeo)", category: "media", icon: "Video",
    defaults: { url: "", autoplay: false } },
  { type: "audio", label: "Áudio", category: "media", icon: "Music",
    defaults: { url: "" } },

  // Conversão
  { type: "button-next", label: "Botão Próximo", category: "conversion", icon: "ArrowRight",
    defaults: { label: "Continuar", style: "primary" } },
  { type: "button-whatsapp", label: "Botão WhatsApp", category: "conversion", icon: "MessageCircle",
    defaults: { label: "Falar no WhatsApp", phone: "", message: "Olá!" } },
  { type: "button-link", label: "Botão Link", category: "conversion", icon: "Link",
    defaults: { label: "Acessar", url: "", target: "_blank" } },
  { type: "button-agenda", label: "Botão Agenda", category: "conversion", icon: "Calendar",
    defaults: { label: "Agendar horário", slug: "" } },
  { type: "form", label: "Formulário (lead)", category: "conversion", icon: "Mail",
    defaults: { title: "Quase lá!", submitLabel: "Quero receber", fields: ["name", "phone"] } },
  { type: "testimonial", label: "Depoimento", category: "conversion", icon: "Quote",
    defaults: { text: "Adorei o serviço!", author: "Cliente Feliz", avatar: "" } },
  { type: "faq", label: "FAQ", category: "conversion", icon: "HelpCircle",
    defaults: { items: [{ q: "Pergunta?", a: "Resposta." }] } },
  { type: "countdown", label: "Contagem regressiva", category: "conversion", icon: "Timer",
    defaults: { minutes: 15, label: "Oferta termina em:" } },

  // Avançado
  { type: "loading", label: "Loading animado", category: "advanced", icon: "Loader",
    defaults: { text: "Analisando suas respostas…", durationMs: 3000, steps: ["Processando", "Calculando perfil", "Quase pronto"] } },
  { type: "progress", label: "Barra de progresso", category: "advanced", icon: "BarChart",
    defaults: { value: 50, color: "" } },
  { type: "html", label: "HTML customizado", category: "advanced", icon: "Code",
    defaults: { html: "<div>Seu HTML aqui</div>" } },
];

export const BLOCK_BY_TYPE = Object.fromEntries(BLOCK_LIBRARY.map((b) => [b.type, b])) as Record<string, BlockDef>;
