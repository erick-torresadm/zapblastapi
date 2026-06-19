// Templates iniciais para o construtor de fluxos.
// Cada template é um conjunto de nodes/edges compatível com o editor (/app/flows/$id).

import { MarkerType } from "@xyflow/react";

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  trigger_default: "manual" | "keyword" | "new_contact";
  trigger_config?: Record<string, any>;
  nodes: any[];
  edges: any[];
};

const edge = (id: string, source: string, target: string, sourceHandle?: string): any => ({
  id, source, target, sourceHandle,
  animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 },
});

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "welcome",
    name: "Boas-vindas + qualificação",
    description: "Saudação, captura nome e interesse, marca tag e transfere para humano.",
    emoji: "👋",
    trigger_default: "new_contact",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Início" } },
      { id: "n1", type: "message", position: { x: 280, y: 140 }, data: { label: "Saudação", message: "Oi! Tudo bem? 👋 Sou o atendimento da loja." } },
      { id: "n2", type: "ask", position: { x: 280, y: 300 }, data: { label: "Pedir nome", message: "Como posso te chamar?", variable: "nome" } },
      { id: "n3", type: "ask", position: { x: 280, y: 460 }, data: { label: "Pedir interesse", message: "Prazer, {{nome}}! O que você está procurando hoje?", variable: "interesse" } },
      { id: "n4", type: "tag", position: { x: 280, y: 620 }, data: { label: "Marcar como lead", tag: "lead-novo" } },
      { id: "n5", type: "transfer_human", position: { x: 280, y: 760 }, data: { label: "Transferir para humano" } },
    ],
    edges: [edge("e1","start","n1"), edge("e2","n1","n2"), edge("e3","n2","n3"), edge("e4","n3","n4"), edge("e5","n4","n5")],
  },
  {
    id: "cart",
    name: "Recuperação de carrinho",
    description: "3 toques cadenciados para clientes que abandonaram o carrinho.",
    emoji: "🛒",
    trigger_default: "manual",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Disparo manual" } },
      { id: "d1", type: "delay", position: { x: 280, y: 140 }, data: { label: "Esperar 1h", delaySeconds: 3600 } },
      { id: "m1", type: "message", position: { x: 280, y: 300 }, data: { label: "1º toque", message: "Oi {{nome}}, vi que você esqueceu uns itens no carrinho 👀 Posso ajudar a finalizar?" } },
      { id: "d2", type: "delay", position: { x: 280, y: 460 }, data: { label: "Esperar 24h", delaySeconds: 86400 } },
      { id: "m2", type: "message", position: { x: 280, y: 620 }, data: { label: "Oferta", message: "Liberei um cupom de 10% só pra você: USE10. Bora finalizar?" } },
      { id: "d3", type: "delay", position: { x: 280, y: 780 }, data: { label: "Esperar 3 dias", delaySeconds: 259200 } },
      { id: "m3", type: "message", position: { x: 280, y: 940 }, data: { label: "Última tentativa", message: "Tô passando aqui por último — seu cupom expira hoje à noite 🕗" } },
    ],
    edges: [edge("e1","start","d1"), edge("e2","d1","m1"), edge("e3","m1","d2"), edge("e4","d2","m2"), edge("e5","m2","d3"), edge("e6","d3","m3")],
  },
  {
    id: "ai_support",
    name: "Suporte com IA",
    description: "IA responde dúvidas comuns; se cliente pedir, transfere para humano.",
    emoji: "🤖",
    trigger_default: "keyword",
    trigger_config: { keywords: ["ajuda", "duvida", "dúvida", "suporte"], match: "any" },
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Palavra-chave" } },
      { id: "a1", type: "ask", position: { x: 280, y: 140 }, data: { label: "Capturar pergunta", message: "Claro! Me conta sua dúvida que eu te ajudo 🙂", variable: "pergunta" } },
      { id: "ai", type: "ai", position: { x: 280, y: 300 }, data: { label: "Responder com IA", systemPrompt: "Você é um atendente educado e direto. Responda a dúvida do cliente em até 4 frases. Se não souber, peça para falar com humano.", userInput: "{{pergunta}}", send: true } },
      { id: "a2", type: "ask", position: { x: 280, y: 460 }, data: { label: "Resolveu?", message: "Resolveu sua dúvida? Responda *sim* ou *humano*.", variable: "resolveu" } },
      { id: "cond", type: "condition", position: { x: 280, y: 620 }, data: { label: "Quer humano?", conditionField: "resolveu", conditionEquals: "humano" } },
      { id: "trans", type: "transfer_human", position: { x: 140, y: 800 }, data: { label: "Transferir" } },
      { id: "end", type: "message", position: { x: 460, y: 800 }, data: { label: "Encerrar", message: "Perfeito! Qualquer coisa é só chamar 👍" } },
    ],
    edges: [
      edge("e1","start","a1"), edge("e2","a1","ai"), edge("e3","ai","a2"), edge("e4","a2","cond"),
      edge("e5","cond","trans","yes"), edge("e6","cond","end","no"),
    ],
  },
  {
    id: "nps",
    name: "Pesquisa NPS",
    description: "Pede nota 0–10, classifica em detrator / neutro / promotor e marca tag.",
    emoji: "⭐",
    trigger_default: "manual",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Disparo manual" } },
      { id: "m1", type: "message", position: { x: 280, y: 140 }, data: { label: "Agradecer", message: "Oi {{nome}}, obrigado pela compra! 🙏" } },
      { id: "a1", type: "ask", position: { x: 280, y: 300 }, data: { label: "Pedir nota", message: "De 0 a 10, o quanto você recomendaria a gente?", variable: "nps" } },
      { id: "c1", type: "condition", position: { x: 280, y: 460 }, data: { label: "Detrator?", conditionField: "nps", conditionOp: "lte", conditionEquals: "6" } },
      { id: "det", type: "tag", position: { x: 80, y: 640 }, data: { label: "Tag detrator", tag: "nps-detrator" } },
      { id: "c2", type: "condition", position: { x: 460, y: 640 }, data: { label: "Promotor?", conditionField: "nps", conditionOp: "gte", conditionEquals: "9" } },
      { id: "pro", type: "tag", position: { x: 360, y: 820 }, data: { label: "Tag promotor", tag: "nps-promotor" } },
      { id: "neu", type: "tag", position: { x: 600, y: 820 }, data: { label: "Tag neutro", tag: "nps-neutro" } },
      { id: "thx", type: "message", position: { x: 280, y: 1000 }, data: { label: "Encerrar", message: "Valeu pelo feedback! 🧡" } },
    ],
    edges: [
      edge("e1","start","m1"), edge("e2","m1","a1"), edge("e3","a1","c1"),
      edge("e4","c1","det","yes"), edge("e5","c1","c2","no"),
      edge("e6","c2","pro","yes"), edge("e7","c2","neu","no"),
      edge("e8","det","thx"), edge("e9","pro","thx"), edge("e10","neu","thx"),
    ],
  },
  {
    id: "menu_faq",
    name: "FAQ com menu numerado",
    description: "Mostra menu 1/2/3, ramifica por opção, oferece humano e usa timeout.",
    emoji: "📋",
    trigger_default: "keyword",
    trigger_config: { keywords: ["menu", "atendimento", "ajuda"], match: "any" },
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Palavra-chave" } },
      { id: "m", type: "menu", position: { x: 240, y: 140 }, data: { label: "Menu principal", message: "Oi! Em que posso ajudar?", menuOptions: "Horário de funcionamento\nFormas de pagamento\nFalar com humano", variable: "menu", timeoutSeconds: 120 } },
      { id: "r1", type: "message", position: { x: 0, y: 360 }, data: { label: "Horários", message: "Atendemos seg–sex, das 9h às 18h. Sábado das 9h às 13h." } },
      { id: "r2", type: "message", position: { x: 240, y: 360 }, data: { label: "Pagamentos", message: "Aceitamos Pix, cartão (até 12x) e boleto." } },
      { id: "th", type: "transfer_human", position: { x: 480, y: 360 }, data: { label: "Humano", message: "Tô te encaminhando pro time agora 🙂" } },
      { id: "inv", type: "message", position: { x: 720, y: 360 }, data: { label: "Opção inválida", message: "Não entendi. Manda só o número da opção (1, 2 ou 3)." } },
      { id: "to", type: "message", position: { x: 960, y: 360 }, data: { label: "Timeout", message: "Tô por aqui quando precisar! É só mandar *menu* 👋" } },
      { id: "back", type: "jump", position: { x: 720, y: 520 }, data: { label: "Voltar ao menu", jumpTo: "m" } },
    ],
    edges: [
      edge("e1", "start", "m"),
      edge("e2", "m", "r1", "opt_1"),
      edge("e3", "m", "r2", "opt_2"),
      edge("e4", "m", "th", "opt_3"),
      edge("e5", "m", "inv", "invalid"),
      edge("e6", "m", "to", "timeout"),
      edge("e7", "inv", "back"),
    ],
  },
  {
    id: "schedule",
    name: "Agendamento",
    description: "Pergunta dia/horário, salva variáveis, atualiza contato e cria nota no CRM.",
    emoji: "📅",
    trigger_default: "manual",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Disparo" } },
      { id: "tw", type: "time_window", position: { x: 280, y: 140 }, data: { label: "Horário comercial?", startHour: 9, endHour: 18, days: "1,2,3,4,5" } },
      { id: "off", type: "message", position: { x: 540, y: 320 }, data: { label: "Fora de horário", message: "Oi {{nome}}! Estamos fora do expediente. Retornamos amanhã às 9h 🙂" } },
      { id: "a1", type: "ask", position: { x: 40, y: 320 }, data: { label: "Dia", message: "Qual data fica boa? (ex: 23/08)", variable: "data_agend", timeoutSeconds: 300 } },
      { id: "a2", type: "ask", position: { x: 40, y: 480 }, data: { label: "Horário", message: "E o horário?", variable: "hora_agend", timeoutSeconds: 300 } },
      { id: "uc", type: "update_contact", position: { x: 40, y: 640 }, data: { label: "Salvar no contato", customFields: "data_agend={{data_agend}}\nhora_agend={{hora_agend}}" } },
      { id: "note", type: "note", position: { x: 40, y: 800 }, data: { label: "Nota CRM", note: "Cliente agendou {{data_agend}} às {{hora_agend}}." } },
      { id: "conf", type: "message", position: { x: 40, y: 960 }, data: { label: "Confirmação", message: "Perfeito! Agendado para *{{data_agend}} às {{hora_agend}}* ✅" } },
    ],
    edges: [
      edge("e1", "start", "tw"),
      edge("e2", "tw", "a1", "in"),
      edge("e3", "tw", "off", "out"),
      edge("e4", "a1", "a2"), edge("e5", "a2", "uc"), edge("e6", "uc", "note"), edge("e7", "note", "conf"),
    ],
  },
  {
    id: "billing",
    name: "Cobrança suave",
    description: "Pergunta motivo do atraso (menu), oferece boleto/Pix, escala detratores.",
    emoji: "💰",
    trigger_default: "manual",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Disparo" } },
      { id: "m1", type: "message", position: { x: 280, y: 140 }, data: { label: "Toque inicial", message: "Oi {{nome}}, tudo bem? Notamos que a fatura de {{mes}} ainda não foi paga. Posso te ajudar?" } },
      { id: "menu", type: "menu", position: { x: 280, y: 300 }, data: { label: "Motivo", message: "Em que posso ajudar?", menuOptions: "Já paguei\nQuero 2ª via\nPreciso de prazo\nFalar com humano", variable: "motivo", timeoutSeconds: 600 } },
      { id: "ok", type: "message", position: { x: -40, y: 520 }, data: { label: "Já paguei", message: "Beleza! Vou conferir no sistema e te confirmo em até 1 dia útil 🙏" } },
      { id: "via2", type: "message", position: { x: 200, y: 520 }, data: { label: "2ª via", message: "Aqui está o link da 2ª via: https://exemplo.com/{{telefone}}" } },
      { id: "prazo", type: "tag", position: { x: 440, y: 520 }, data: { label: "Tag prazo", tag: "negociacao" } },
      { id: "th", type: "transfer_human", position: { x: 680, y: 520 }, data: { label: "Humano" } },
      { id: "inv", type: "message", position: { x: 920, y: 520 }, data: { label: "Inválido", message: "Não entendi. Responda só com o número (1, 2, 3 ou 4)." } },
      { id: "back", type: "jump", position: { x: 920, y: 680 }, data: { label: "Volta menu", jumpTo: "menu" } },
    ],
    edges: [
      edge("e1", "start", "m1"), edge("e2", "m1", "menu"),
      edge("o1", "menu", "ok", "opt_1"), edge("o2", "menu", "via2", "opt_2"),
      edge("o3", "menu", "prazo", "opt_3"), edge("o4", "menu", "th", "opt_4"),
      edge("o5", "menu", "inv", "invalid"), edge("o6", "inv", "back"),
    ],
  },
  {
    id: "sdr",
    name: "Qualificação SDR",
    description: "Captura nome/empresa/tamanho, ramifica por porte e atualiza contato + tag.",
    emoji: "🎯",
    trigger_default: "new_contact",
    nodes: [
      { id: "start", type: "start", position: { x: 320, y: 0 }, data: { label: "Início" } },
      { id: "a1", type: "ask", position: { x: 280, y: 140 }, data: { label: "Nome", message: "Bem-vindo(a)! Como posso te chamar?", variable: "nome", timeoutSeconds: 600 } },
      { id: "a2", type: "ask", position: { x: 280, y: 300 }, data: { label: "Empresa", message: "Prazer, {{nome}}! Qual o nome da sua empresa?", variable: "empresa", timeoutSeconds: 600 } },
      { id: "a3", type: "ask", position: { x: 280, y: 460 }, data: { label: "Tamanho", message: "Quantos funcionários vocês têm? (apenas número)", variable: "tamanho", timeoutSeconds: 600 } },
      { id: "uc", type: "update_contact", position: { x: 280, y: 620 }, data: { label: "Salvar contato", contactName: "{{nome}}", customFields: "empresa={{empresa}}\ntamanho={{tamanho}}" } },
      { id: "cond", type: "condition", position: { x: 280, y: 780 }, data: { label: "Grande conta?", conditionField: "tamanho", conditionOp: "gte", conditionEquals: "50" } },
      { id: "ent", type: "tag", position: { x: 60, y: 940 }, data: { label: "Tag enterprise", tag: "enterprise" } },
      { id: "smb", type: "tag", position: { x: 500, y: 940 }, data: { label: "Tag SMB", tag: "smb" } },
      { id: "th", type: "transfer_human", position: { x: 60, y: 1100 }, data: { label: "Passa pro AE", message: "Vou te conectar com um especialista agora 🙂" } },
      { id: "end", type: "message", position: { x: 500, y: 1100 }, data: { label: "Auto-serviço", message: "Aqui está nossa demo: https://exemplo.com/demo. Qualquer coisa é só chamar!" } },
    ],
    edges: [
      edge("e1", "start", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3"),
      edge("e4", "a3", "uc"), edge("e5", "uc", "cond"),
      edge("e6", "cond", "ent", "yes"), edge("e7", "cond", "smb", "no"),
      edge("e8", "ent", "th"), edge("e9", "smb", "end"),
    ],
  },
];

