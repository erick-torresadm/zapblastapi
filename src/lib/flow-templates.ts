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
];
