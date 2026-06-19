import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type Locale = "pt" | "en" | "es" | "fr";

const STORAGE_KEY = "perseidas-locale";
const SUPPORTED: Locale[] = ["pt", "en", "es", "fr"];

export const LOCALE_LABELS: Record<Locale, { native: string; flag: string; htmlLang: string }> = {
  pt: { native: "Português", flag: "🇧🇷", htmlLang: "pt-BR" },
  en: { native: "English",   flag: "🇺🇸", htmlLang: "en"    },
  es: { native: "Español",   flag: "🇪🇸", htmlLang: "es"    },
  fr: { native: "Français",  flag: "🇫🇷", htmlLang: "fr"    },
};

// Translation dictionaries — nested keys flattened with dot notation.
type Dict = Record<string, string>;

const PT: Dict = {
  "nav.features": "Recursos",
  "nav.how": "Como funciona",
  "nav.antiban": "Anti-ban",
  "nav.pricing": "Planos",
  "nav.faq": "FAQ",
  "nav.signin": "Entrar",
  "nav.signup": "Começar grátis",

  "hero.badge": "Disparos · Fluxos · CRM · Anti-ban",
  "hero.title1": "WhatsApp em escala,",
  "hero.title2": "do disparo ao atendimento",
  "hero.subtitle": "Dispare campanhas <b>anti-ban</b>, automatize respostas com fluxos por palavra-chave e atenda no <b>CRM</b> com sua equipe — tudo no mesmo painel, com aquecimento automático dos chips.",
  "hero.cta_primary": "Começar grátis",
  "hero.cta_secondary": "Ver recursos",

  "metrics.uptime": "Uptime entrega",
  "metrics.sent": "Msgs enviadas",
  "metrics.lessbans": "Menos bans",
  "metrics.flows": "Fluxos rodando",

  "features.kicker": "Plataforma completa",
  "features.title": "Disparo, bot e atendimento. Um painel só.",
  "features.antiban.title": "Anti-ban Engine",
  "features.antiban.desc": "Delays randômicos, spintax obrigatório, presença/digitação simulada, rotação inteligente entre chips, janela de horário comercial e limite diário — tudo automático.",
  "features.antiban.b1": "Detecta padrões suspeitos antes do WhatsApp",
  "features.antiban.b2": "Health score por chip em tempo real",
  "features.antiban.b3": "Pausa automática se taxa de erro >5%",
  "features.antiban.b4": "Warmup escalonado de 20 → 300+ msgs/dia",
  "features.antiban.b5": "Agendamento com fuso e retomada automática",
  "features.flows.title": "Fluxos por palavra-chave",
  "features.flows.desc": "Cliente manda 'preço', bot dispara fluxo. Envia texto, imagem, áudio e vídeo, com 'digitando…' simulado.",
  "features.crm.title": "CRM multi-atendente",
  "features.crm.desc": "Inbox estilo WhatsApp Web. Transfira conversas, atribua filas, cada atendente vê só o que é dele.",
  "features.bot.title": "Bot 24/7",
  "features.bot.desc": "Responde fora do horário, qualifica o lead e entrega pronto pra venda no CRM.",
  "features.team.title": "Equipe e permissões",
  "features.team.desc": "Convide atendentes já cadastrados, controle quem vê o quê. Dono mantém a fila.",
  "features.warmup.title": "Aquecimento bidirecional",
  "features.warmup.desc": "Seus chips conversam entre si automaticamente, simulando uso humano antes do disparo.",
  "features.market.title": "Marketplace de chips BR",
  "features.market.desc": "Compre chips virtuais brasileiros direto no painel, com saldo pré-pago.",
  "features.spintax.title": "Spintax + variáveis",
  "features.spintax.desc": "{Oi|Olá|E aí} {{nome}} — cada envio é único, ninguém repete mensagem.",
  "features.reports.title": "Relatórios em tempo real",
  "features.reports.desc": "Entregues, lidas, respondidas — por chip, por campanha, por contato.",

  "how.kicker": "Como funciona",
  "how.title1": "Do",
  "how.title2": "QR Code",
  "how.title3": "ao primeiro venda",
  "how.subtitle": "4 passos. 5 minutos. Sem código, sem servidor, sem dor de cabeça.",
  "how.step1.title": "Conecte seu chip",
  "how.step1.desc": "Escaneie o QR Code ou compre um chip BR no marketplace. Aquecimento automático começa em segundos.",
  "how.step2.title": "Monte seu fluxo",
  "how.step2.desc": "Arraste blocos: cliente digita 'preço' → bot manda áudio + imagem + texto com 'digitando…' simulado.",
  "how.step3.title": "Dispare ou atenda",
  "how.step3.desc": "Campanha em massa anti-ban OU inbox CRM multi-atendente. Você escolhe — ou faz os dois.",
  "how.step4.title": "Monitore tudo",
  "how.step4.desc": "Entregas, leituras, respostas, health score por chip. Pausa automática se algo cheira a ban.",
  "how.flow.trigger": "Mensagem recebida",
  "how.flow.trigger_sub": "quando: contém 'preço'",
  "how.flow.text": "Enviar texto",
  "how.flow.text_sub": "'Oi! 👋 Vou te mandar…'",
  "how.flow.wait": "Aguardar",
  "how.flow.wait_sub": "30 segundos",
  "how.flow.reply": "Enviar resposta",
  "how.flow.reply_sub": "áudio + imagem",
  "how.flow.done": "Pronto",

  "antiban.kicker": "Por que menos bans?",
  "antiban.title": "Evolution API ≠ whatsapp-web.js",
  "antiban.desc": "Bibliotecas baseadas em Puppeteer (pedroslopez) automatizam o navegador — o WhatsApp identifica isso na hora. A Evolution conversa direto no protocolo multi-device, igual o app oficial. Resultado: tráfego indistinguível de um celular real.",
  "antiban.cta": "Ler análise completa",

  "pricing.kicker": "Planos",
  "pricing.title": "Escolha sua escala.",
  "pricing.subtitle": "Sem fidelidade. Anual paga no PIX com 30% off.",
  "pricing.annual": "Anual",
  "pricing.monthly": "Mensal",
  "pricing.discount": "−30% PIX",
  "pricing.permonth": "/mês",
  "pricing.recommended": "Recomendado",
  "pricing.economy": "Economize R$ {value}/ano",
  "pricing.recurring": "cobrança recorrente no cartão",
  "pricing.cta_annual": "Assinar anual",
  "pricing.cta_monthly": "Assinar mensal",
  "pricing.payments": "💳 PIX e cartão de crédito · pagamentos via Efí Bank",

  "plans.starter.f1": "1 chip conectado",
  "plans.starter.f2": "1.000 msgs/dia",
  "plans.starter.f3": "1 campanha por vez",
  "plans.starter.f4": "500 contatos/lista",
  "plans.starter.f5": "Sem aquecimento",
  "plans.starter.f6": "Suporte por email",

  "plans.pro.f1": "3 chips conectados",
  "plans.pro.f2": "5.000 msgs/dia",
  "plans.pro.f3": "5 campanhas simultâneas",
  "plans.pro.f4": "5.000 contatos/lista",
  "plans.pro.f5": "Aquecimento básico",
  "plans.pro.f6": "CRM com 5 agentes",
  "plans.pro.f7": "Suporte prioritário",

  "plans.scale.f1": "20+ chips conectados",
  "plans.scale.f2": "25.000 msgs/dia",
  "plans.scale.f3": "Campanhas ilimitadas",
  "plans.scale.f4": "Contatos ilimitados/lista",
  "plans.scale.f5": "Aquecimento avançado com IA",
  "plans.scale.f6": "CRM com agentes ilimitados",
  "plans.scale.f7": "Gerente de contas dedicado",
  "plans.scale.f8": "Suporte 24/7",

  "faq.kicker": "FAQ",
  "faq.title": "Perguntas frequentes",
  "faq.q1": "Meu chip vai ser banido?",
  "faq.a1": "Nenhuma plataforma garante 100% — quem garante mente. O que fazemos: reduzir drasticamente o risco com aquecimento, spintax, delays humanos e circuit breaker. Histórico de chips bem aquecidos = >90% de sobrevida em 30 dias.",
  "faq.q2": "Preciso da Evolution API?",
  "faq.a2": "Sim — você pode usar a sua ou contratar uma da nossa lista de provedores recomendados.",
  "faq.q3": "Posso comprar chips dentro da plataforma?",
  "faq.a3": "Sim, no Marketplace. Chips virtuais BR a partir de R$ 7,90, pagamento via saldo pré-pago.",
  "faq.q4": "Aceita Pix?",
  "faq.a4": "Sim — PIX e cartão de crédito. No plano anual o PIX é preferencial (à vista com 30% de desconto). Integração via Efí Bank.",

  "cta.title": "Pronto pra rodar tudo num lugar só?",
  "cta.desc": "Crie sua conta, conecte seu chip e tenha disparo, fluxo e CRM ativos em 5 minutos. <b>10 dias grátis no plano Pro</b>, sem cartão.",
  "cta.button": "Começar agora",

  "footer.copy": "© 2026 Perseidas · Disparos + Fluxos + CRM no WhatsApp",
  "footer.disclaimer": "*Resultados variam conforme uso. Anti-ban reduz risco, não elimina.",

  "lang.label": "Idioma",
};

const EN: Dict = {
  "nav.features": "Features",
  "nav.how": "How it works",
  "nav.antiban": "Anti-ban",
  "nav.pricing": "Pricing",
  "nav.faq": "FAQ",
  "nav.signin": "Sign in",
  "nav.signup": "Start free",

  "hero.badge": "Bulk · Flows · CRM · Anti-ban",
  "hero.title1": "WhatsApp at scale,",
  "hero.title2": "from blast to support",
  "hero.subtitle": "Send <b>anti-ban</b> bulk campaigns, automate replies with keyword flows and handle conversations in a <b>CRM</b> with your team — one dashboard, with automatic chip warm-up.",
  "hero.cta_primary": "Start free",
  "hero.cta_secondary": "See features",

  "metrics.uptime": "Delivery uptime",
  "metrics.sent": "Messages sent",
  "metrics.lessbans": "Fewer bans",
  "metrics.flows": "Flows running",

  "features.kicker": "All-in-one platform",
  "features.title": "Bulk, bot and inbox. One dashboard.",
  "features.antiban.title": "Anti-ban Engine",
  "features.antiban.desc": "Random delays, mandatory spintax, simulated typing/presence, smart chip rotation, business-hours window and daily caps — all automatic.",
  "features.antiban.b1": "Detects suspicious patterns before WhatsApp does",
  "features.antiban.b2": "Per-chip health score in real time",
  "features.antiban.b3": "Auto-pause if error rate exceeds 5%",
  "features.antiban.b4": "Tiered warm-up from 20 → 300+ msgs/day",
  "features.antiban.b5": "Time-zone aware scheduling with auto-resume",
  "features.flows.title": "Keyword flows",
  "features.flows.desc": "Customer types 'price', the bot fires a flow. Sends text, image, audio and video with simulated 'typing…'.",
  "features.crm.title": "Multi-agent CRM",
  "features.crm.desc": "WhatsApp Web–style inbox. Transfer chats, assign queues — each agent only sees their own.",
  "features.bot.title": "24/7 bot",
  "features.bot.desc": "Answers after hours, qualifies the lead and hands it ready-to-sell to the CRM.",
  "features.team.title": "Team & permissions",
  "features.team.desc": "Invite existing operators, control who sees what. Owner keeps the queue.",
  "features.warmup.title": "Bidirectional warm-up",
  "features.warmup.desc": "Your chips chat with each other automatically, simulating human use before any blast.",
  "features.market.title": "BR chip marketplace",
  "features.market.desc": "Buy Brazilian virtual chips inside the dashboard, with prepaid credit.",
  "features.spintax.title": "Spintax + variables",
  "features.spintax.desc": "{Hi|Hello|Hey} {{name}} — every send is unique, no one gets the same message.",
  "features.reports.title": "Real-time reports",
  "features.reports.desc": "Delivered, read, replied — by chip, campaign or contact.",

  "how.kicker": "How it works",
  "how.title1": "From",
  "how.title2": "QR Code",
  "how.title3": "to your first sale",
  "how.subtitle": "4 steps. 5 minutes. No code, no server, no headaches.",
  "how.step1.title": "Connect your chip",
  "how.step1.desc": "Scan the QR Code or buy a BR chip on the marketplace. Automatic warm-up kicks in within seconds.",
  "how.step2.title": "Build your flow",
  "how.step2.desc": "Drag blocks: customer types 'price' → bot sends audio + image + text with simulated 'typing…'.",
  "how.step3.title": "Blast or reply",
  "how.step3.desc": "Anti-ban bulk campaign OR multi-agent CRM inbox. Pick one — or do both.",
  "how.step4.title": "Monitor everything",
  "how.step4.desc": "Deliveries, reads, replies, per-chip health score. Auto-pause if anything smells like a ban.",
  "how.flow.trigger": "Message received",
  "how.flow.trigger_sub": "when: contains 'price'",
  "how.flow.text": "Send text",
  "how.flow.text_sub": "'Hi! 👋 I'll send you…'",
  "how.flow.wait": "Wait",
  "how.flow.wait_sub": "30 seconds",
  "how.flow.reply": "Send reply",
  "how.flow.reply_sub": "audio + image",
  "how.flow.done": "Done",

  "antiban.kicker": "Why fewer bans?",
  "antiban.title": "Evolution API ≠ whatsapp-web.js",
  "antiban.desc": "Puppeteer-based libraries (pedroslopez) automate the browser — WhatsApp catches it instantly. Evolution speaks the multi-device protocol directly, like the official app. Result: traffic indistinguishable from a real phone.",
  "antiban.cta": "Read the full breakdown",

  "pricing.kicker": "Pricing",
  "pricing.title": "Pick your scale.",
  "pricing.subtitle": "No lock-in. Pay annually via PIX and save 30%.",
  "pricing.annual": "Annual",
  "pricing.monthly": "Monthly",
  "pricing.discount": "−30% PIX",
  "pricing.permonth": "/mo",
  "pricing.recommended": "Recommended",
  "pricing.economy": "Save R$ {value}/yr",
  "pricing.recurring": "recurring card billing",
  "pricing.cta_annual": "Subscribe annual",
  "pricing.cta_monthly": "Subscribe monthly",
  "pricing.payments": "💳 PIX and credit card · payments via Efí Bank",

  "plans.starter.f1": "1 connected chip",
  "plans.starter.f2": "1,000 msgs/day",
  "plans.starter.f3": "1 campaign at a time",
  "plans.starter.f4": "500 contacts/list",
  "plans.starter.f5": "No warm-up",
  "plans.starter.f6": "Email support",

  "plans.pro.f1": "3 connected chips",
  "plans.pro.f2": "5,000 msgs/day",
  "plans.pro.f3": "5 simultaneous campaigns",
  "plans.pro.f4": "5,000 contacts/list",
  "plans.pro.f5": "Basic warm-up",
  "plans.pro.f6": "CRM with 5 agents",
  "plans.pro.f7": "Priority support",

  "plans.scale.f1": "20+ connected chips",
  "plans.scale.f2": "25,000 msgs/day",
  "plans.scale.f3": "Unlimited campaigns",
  "plans.scale.f4": "Unlimited contacts/list",
  "plans.scale.f5": "AI-powered advanced warm-up",
  "plans.scale.f6": "CRM with unlimited agents",
  "plans.scale.f7": "Dedicated account manager",
  "plans.scale.f8": "24/7 support",

  "faq.kicker": "FAQ",
  "faq.title": "Frequently asked",
  "faq.q1": "Will my chip get banned?",
  "faq.a1": "No platform can promise 100% — anyone who does is lying. What we do: drastically reduce risk with warm-up, spintax, human delays and a circuit breaker. Well warmed chips survive >90% past 30 days.",
  "faq.q2": "Do I need Evolution API?",
  "faq.a2": "Yes — bring your own or hire one from our recommended providers list.",
  "faq.q3": "Can I buy chips inside the platform?",
  "faq.a3": "Yes, in the Marketplace. BR virtual chips from R$ 7.90, paid with prepaid credit.",
  "faq.q4": "Do you accept Pix?",
  "faq.a4": "Yes — PIX and credit card. On the annual plan PIX is preferred (paid upfront, 30% off). Integration via Efí Bank.",

  "cta.title": "Ready to run it all in one place?",
  "cta.desc": "Create your account, connect your chip and have bulk, flows and CRM live in 5 minutes. <b>10 days free on Pro</b>, no card required.",
  "cta.button": "Get started",

  "footer.copy": "© 2026 Perseidas · Bulk + Flows + CRM for WhatsApp",
  "footer.disclaimer": "*Results vary with usage. Anti-ban reduces risk, doesn't eliminate it.",

  "lang.label": "Language",
};

const ES: Dict = {
  "nav.features": "Funciones",
  "nav.how": "Cómo funciona",
  "nav.antiban": "Anti-ban",
  "nav.pricing": "Planes",
  "nav.faq": "FAQ",
  "nav.signin": "Entrar",
  "nav.signup": "Empezar gratis",

  "hero.badge": "Envíos · Flujos · CRM · Anti-ban",
  "hero.title1": "WhatsApp a escala,",
  "hero.title2": "del envío a la atención",
  "hero.subtitle": "Envía campañas <b>anti-ban</b>, automatiza respuestas con flujos por palabra clave y atiende en el <b>CRM</b> con tu equipo — todo en un solo panel, con calentamiento automático de chips.",
  "hero.cta_primary": "Empezar gratis",
  "hero.cta_secondary": "Ver funciones",

  "metrics.uptime": "Uptime de entrega",
  "metrics.sent": "Mensajes enviados",
  "metrics.lessbans": "Menos bans",
  "metrics.flows": "Flujos activos",

  "features.kicker": "Plataforma completa",
  "features.title": "Envíos, bot y atención. Un solo panel.",
  "features.antiban.title": "Motor Anti-ban",
  "features.antiban.desc": "Delays aleatorios, spintax obligatorio, presencia/escritura simulada, rotación inteligente de chips, ventana de horario y límite diario — todo automático.",
  "features.antiban.b1": "Detecta patrones sospechosos antes que WhatsApp",
  "features.antiban.b2": "Health score por chip en tiempo real",
  "features.antiban.b3": "Pausa automática si la tasa de error supera 5%",
  "features.antiban.b4": "Warm-up escalonado de 20 → 300+ msgs/día",
  "features.antiban.b5": "Programación con zona horaria y reanudación automática",
  "features.flows.title": "Flujos por palabra clave",
  "features.flows.desc": "El cliente escribe 'precio', el bot dispara un flujo. Envía texto, imagen, audio y video con 'escribiendo…' simulado.",
  "features.crm.title": "CRM multi-agente",
  "features.crm.desc": "Inbox estilo WhatsApp Web. Transfiere chats, asigna colas, cada agente ve solo lo suyo.",
  "features.bot.title": "Bot 24/7",
  "features.bot.desc": "Responde fuera de hora, califica el lead y lo entrega listo al CRM.",
  "features.team.title": "Equipo y permisos",
  "features.team.desc": "Invita operadores, controla quién ve qué. El dueño mantiene la cola.",
  "features.warmup.title": "Calentamiento bidireccional",
  "features.warmup.desc": "Tus chips conversan entre sí automáticamente, simulando uso humano antes del envío.",
  "features.market.title": "Marketplace de chips BR",
  "features.market.desc": "Compra chips virtuales brasileños desde el panel, con saldo prepago.",
  "features.spintax.title": "Spintax + variables",
  "features.spintax.desc": "{Hola|Qué tal|Hey} {{nombre}} — cada envío es único, nadie recibe el mismo mensaje.",
  "features.reports.title": "Reportes en tiempo real",
  "features.reports.desc": "Entregados, leídos, respondidos — por chip, campaña o contacto.",

  "how.kicker": "Cómo funciona",
  "how.title1": "Del",
  "how.title2": "QR Code",
  "how.title3": "a tu primera venta",
  "how.subtitle": "4 pasos. 5 minutos. Sin código, sin servidor, sin dolores.",
  "how.step1.title": "Conecta tu chip",
  "how.step1.desc": "Escanea el QR o compra un chip BR en el marketplace. El warm-up automático arranca en segundos.",
  "how.step2.title": "Arma tu flujo",
  "how.step2.desc": "Arrastra bloques: el cliente escribe 'precio' → el bot manda audio + imagen + texto con 'escribiendo…'.",
  "how.step3.title": "Envía o atiende",
  "how.step3.desc": "Campaña masiva anti-ban O inbox CRM multi-agente. Elige una — o haz las dos.",
  "how.step4.title": "Monitorea todo",
  "how.step4.desc": "Entregas, lecturas, respuestas, health score por chip. Pausa automática si algo huele a ban.",
  "how.flow.trigger": "Mensaje recibido",
  "how.flow.trigger_sub": "cuando: contiene 'precio'",
  "how.flow.text": "Enviar texto",
  "how.flow.text_sub": "'¡Hola! 👋 Te mando…'",
  "how.flow.wait": "Esperar",
  "how.flow.wait_sub": "30 segundos",
  "how.flow.reply": "Enviar respuesta",
  "how.flow.reply_sub": "audio + imagen",
  "how.flow.done": "Listo",

  "antiban.kicker": "¿Por qué menos bans?",
  "antiban.title": "Evolution API ≠ whatsapp-web.js",
  "antiban.desc": "Las librerías basadas en Puppeteer (pedroslopez) automatizan el navegador — WhatsApp lo detecta al instante. Evolution habla el protocolo multi-device directamente, como la app oficial. Resultado: tráfico indistinguible de un teléfono real.",
  "antiban.cta": "Leer el análisis completo",

  "pricing.kicker": "Planes",
  "pricing.title": "Elige tu escala.",
  "pricing.subtitle": "Sin permanencia. Anual con PIX = 30% off.",
  "pricing.annual": "Anual",
  "pricing.monthly": "Mensual",
  "pricing.discount": "−30% PIX",
  "pricing.permonth": "/mes",
  "pricing.recommended": "Recomendado",
  "pricing.economy": "Ahorra R$ {value}/año",
  "pricing.recurring": "cobro recurrente con tarjeta",
  "pricing.cta_annual": "Suscribirme anual",
  "pricing.cta_monthly": "Suscribirme mensual",
  "pricing.payments": "💳 PIX y tarjeta · pagos vía Efí Bank",

  "plans.starter.f1": "1 chip conectado",
  "plans.starter.f2": "1.000 msgs/día",
  "plans.starter.f3": "1 campaña a la vez",
  "plans.starter.f4": "500 contactos/lista",
  "plans.starter.f5": "Sin warm-up",
  "plans.starter.f6": "Soporte por email",

  "plans.pro.f1": "3 chips conectados",
  "plans.pro.f2": "5.000 msgs/día",
  "plans.pro.f3": "5 campañas simultáneas",
  "plans.pro.f4": "5.000 contactos/lista",
  "plans.pro.f5": "Warm-up básico",
  "plans.pro.f6": "CRM con 5 agentes",
  "plans.pro.f7": "Soporte prioritario",

  "plans.scale.f1": "20+ chips conectados",
  "plans.scale.f2": "25.000 msgs/día",
  "plans.scale.f3": "Campañas ilimitadas",
  "plans.scale.f4": "Contactos ilimitados/lista",
  "plans.scale.f5": "Warm-up avanzado con IA",
  "plans.scale.f6": "CRM con agentes ilimitados",
  "plans.scale.f7": "Gerente de cuenta dedicado",
  "plans.scale.f8": "Soporte 24/7",

  "faq.kicker": "FAQ",
  "faq.title": "Preguntas frecuentes",
  "faq.q1": "¿Banearán mi chip?",
  "faq.a1": "Ninguna plataforma garantiza el 100%. Lo que sí: reducir drásticamente el riesgo con warm-up, spintax, delays humanos y circuit breaker. Chips bien calentados sobreviven >90% a 30 días.",
  "faq.q2": "¿Necesito Evolution API?",
  "faq.a2": "Sí — la tuya o una de nuestra lista de proveedores recomendados.",
  "faq.q3": "¿Puedo comprar chips dentro de la plataforma?",
  "faq.a3": "Sí, en el Marketplace. Chips virtuales BR desde R$ 7,90 con saldo prepago.",
  "faq.q4": "¿Aceptan Pix?",
  "faq.a4": "Sí — PIX y tarjeta. En el plan anual PIX es preferente (pago único, 30% off). Integración vía Efí Bank.",

  "cta.title": "¿Listo para correrlo todo en un solo lugar?",
  "cta.desc": "Crea tu cuenta, conecta tu chip y ten envíos, flujos y CRM activos en 5 minutos. <b>10 días gratis en Pro</b>, sin tarjeta.",
  "cta.button": "Empezar ahora",

  "footer.copy": "© 2026 Perseidas · Envíos + Flujos + CRM en WhatsApp",
  "footer.disclaimer": "*Los resultados varían según el uso. Anti-ban reduce riesgo, no lo elimina.",

  "lang.label": "Idioma",
};

const FR: Dict = {
  "nav.features": "Fonctions",
  "nav.how": "Fonctionnement",
  "nav.antiban": "Anti-ban",
  "nav.pricing": "Tarifs",
  "nav.faq": "FAQ",
  "nav.signin": "Connexion",
  "nav.signup": "Démarrer gratuitement",

  "hero.badge": "Envois · Flux · CRM · Anti-ban",
  "hero.title1": "WhatsApp à grande échelle,",
  "hero.title2": "de l'envoi au support",
  "hero.subtitle": "Envoyez des campagnes <b>anti-ban</b>, automatisez les réponses avec des flux par mot-clé et gérez les conversations dans un <b>CRM</b> avec votre équipe — tout dans un seul tableau de bord, avec préchauffage automatique des puces.",
  "hero.cta_primary": "Démarrer gratuitement",
  "hero.cta_secondary": "Voir les fonctions",

  "metrics.uptime": "Uptime de livraison",
  "metrics.sent": "Messages envoyés",
  "metrics.lessbans": "Moins de bans",
  "metrics.flows": "Flux actifs",

  "features.kicker": "Plateforme complète",
  "features.title": "Envois, bot et inbox. Un seul panneau.",
  "features.antiban.title": "Moteur Anti-ban",
  "features.antiban.desc": "Délais aléatoires, spintax obligatoire, présence/saisie simulée, rotation intelligente des puces, plage horaire et plafond quotidien — tout automatique.",
  "features.antiban.b1": "Détecte les schémas suspects avant WhatsApp",
  "features.antiban.b2": "Score de santé par puce en temps réel",
  "features.antiban.b3": "Pause auto si le taux d'erreur dépasse 5%",
  "features.antiban.b4": "Warm-up progressif de 20 → 300+ msgs/jour",
  "features.antiban.b5": "Planification avec fuseau et reprise auto",
  "features.flows.title": "Flux par mot-clé",
  "features.flows.desc": "Le client tape 'prix', le bot déclenche un flux. Envoie texte, image, audio et vidéo avec 'en train d'écrire…' simulé.",
  "features.crm.title": "CRM multi-agent",
  "features.crm.desc": "Inbox façon WhatsApp Web. Transférez les chats, assignez les files, chaque agent ne voit que ses dossiers.",
  "features.bot.title": "Bot 24/7",
  "features.bot.desc": "Répond hors horaires, qualifie le lead et le livre prêt à vendre au CRM.",
  "features.team.title": "Équipe et permissions",
  "features.team.desc": "Invitez des opérateurs, contrôlez qui voit quoi. Le propriétaire garde la file.",
  "features.warmup.title": "Warm-up bidirectionnel",
  "features.warmup.desc": "Vos puces discutent entre elles automatiquement, simulant un usage humain avant l'envoi.",
  "features.market.title": "Marketplace de puces BR",
  "features.market.desc": "Achetez des puces virtuelles brésiliennes directement, avec solde prépayé.",
  "features.spintax.title": "Spintax + variables",
  "features.spintax.desc": "{Salut|Coucou|Hey} {{prenom}} — chaque envoi est unique, personne ne reçoit le même message.",
  "features.reports.title": "Rapports en temps réel",
  "features.reports.desc": "Livrés, lus, répondus — par puce, par campagne, par contact.",

  "how.kicker": "Fonctionnement",
  "how.title1": "Du",
  "how.title2": "QR Code",
  "how.title3": "à la première vente",
  "how.subtitle": "4 étapes. 5 minutes. Sans code, sans serveur, sans prise de tête.",
  "how.step1.title": "Connectez votre puce",
  "how.step1.desc": "Scannez le QR ou achetez une puce BR sur la marketplace. Le warm-up automatique démarre en quelques secondes.",
  "how.step2.title": "Montez votre flux",
  "how.step2.desc": "Glissez les blocs : le client tape 'prix' → le bot envoie audio + image + texte avec 'en train d'écrire…'.",
  "how.step3.title": "Envoyez ou répondez",
  "how.step3.desc": "Campagne en masse anti-ban OU inbox CRM multi-agent. Choisissez — ou faites les deux.",
  "how.step4.title": "Surveillez tout",
  "how.step4.desc": "Livraisons, lectures, réponses, score de santé par puce. Pause auto si quelque chose sent le ban.",
  "how.flow.trigger": "Message reçu",
  "how.flow.trigger_sub": "quand : contient 'prix'",
  "how.flow.text": "Envoyer texte",
  "how.flow.text_sub": "'Salut ! 👋 Je vous envoie…'",
  "how.flow.wait": "Attendre",
  "how.flow.wait_sub": "30 secondes",
  "how.flow.reply": "Envoyer réponse",
  "how.flow.reply_sub": "audio + image",
  "how.flow.done": "Terminé",

  "antiban.kicker": "Pourquoi moins de bans ?",
  "antiban.title": "Evolution API ≠ whatsapp-web.js",
  "antiban.desc": "Les librairies basées sur Puppeteer (pedroslopez) automatisent le navigateur — WhatsApp le repère immédiatement. Evolution parle directement le protocole multi-device, comme l'app officielle. Résultat : trafic indistinguable d'un vrai téléphone.",
  "antiban.cta": "Lire l'analyse complète",

  "pricing.kicker": "Tarifs",
  "pricing.title": "Choisissez votre échelle.",
  "pricing.subtitle": "Sans engagement. Annuel via PIX = 30% off.",
  "pricing.annual": "Annuel",
  "pricing.monthly": "Mensuel",
  "pricing.discount": "−30% PIX",
  "pricing.permonth": "/mois",
  "pricing.recommended": "Recommandé",
  "pricing.economy": "Économisez R$ {value}/an",
  "pricing.recurring": "facturation récurrente par carte",
  "pricing.cta_annual": "S'abonner annuel",
  "pricing.cta_monthly": "S'abonner mensuel",
  "pricing.payments": "💳 PIX et carte · paiements via Efí Bank",

  "plans.starter.f1": "1 puce connectée",
  "plans.starter.f2": "1 000 msgs/jour",
  "plans.starter.f3": "1 campagne à la fois",
  "plans.starter.f4": "500 contacts/liste",
  "plans.starter.f5": "Sans warm-up",
  "plans.starter.f6": "Support par e-mail",

  "plans.pro.f1": "3 puces connectées",
  "plans.pro.f2": "5 000 msgs/jour",
  "plans.pro.f3": "5 campagnes simultanées",
  "plans.pro.f4": "5 000 contacts/liste",
  "plans.pro.f5": "Warm-up basique",
  "plans.pro.f6": "CRM avec 5 agents",
  "plans.pro.f7": "Support prioritaire",

  "plans.scale.f1": "20+ puces connectées",
  "plans.scale.f2": "25 000 msgs/jour",
  "plans.scale.f3": "Campagnes illimitées",
  "plans.scale.f4": "Contacts illimités/liste",
  "plans.scale.f5": "Warm-up avancé par IA",
  "plans.scale.f6": "CRM avec agents illimités",
  "plans.scale.f7": "Account manager dédié",
  "plans.scale.f8": "Support 24/7",

  "faq.kicker": "FAQ",
  "faq.title": "Questions fréquentes",
  "faq.q1": "Ma puce va-t-elle être bannie ?",
  "faq.a1": "Aucune plateforme ne garantit 100% — celles qui le promettent mentent. Ce qu'on fait : réduire drastiquement le risque avec warm-up, spintax, délais humains et circuit breaker. Puces bien chauffées survivent >90% à 30 jours.",
  "faq.q2": "Faut-il Evolution API ?",
  "faq.a2": "Oui — la vôtre ou une de notre liste de fournisseurs recommandés.",
  "faq.q3": "Puis-je acheter des puces dans la plateforme ?",
  "faq.a3": "Oui, dans la Marketplace. Puces virtuelles BR à partir de R$ 7,90 avec solde prépayé.",
  "faq.q4": "Acceptez-vous Pix ?",
  "faq.a4": "Oui — PIX et carte. Sur l'annuel, PIX est préférable (payé d'avance, 30% off). Intégration via Efí Bank.",

  "cta.title": "Prêt à tout faire tourner au même endroit ?",
  "cta.desc": "Créez votre compte, connectez votre puce et ayez envois, flux et CRM actifs en 5 minutes. <b>10 jours gratuits sur Pro</b>, sans carte.",
  "cta.button": "Commencer maintenant",

  "footer.copy": "© 2026 Perseidas · Envois + Flux + CRM sur WhatsApp",
  "footer.disclaimer": "*Les résultats varient selon l'usage. Anti-ban réduit le risque, ne l'élimine pas.",

  "lang.label": "Langue",
};

const DICTS: Record<Locale, Dict> = { pt: PT, en: EN, es: ES, fr: FR };

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nCtx | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "pt";
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {}
  const nav = (navigator.language || "pt").toLowerCase();
  if (nav.startsWith("en")) return "en";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("fr")) return "fr";
  return "pt";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt");

  useEffect(() => { setLocaleState(detectInitialLocale()); }, []);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = LOCALE_LABELS[locale].htmlLang;
    }
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  };

  const value = useMemo<I18nCtx>(() => ({
    locale,
    setLocale,
    t: (key, vars) => {
      const dict = DICTS[locale] || PT;
      let raw = dict[key] ?? PT[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) raw = raw.replace(`{${k}}`, String(v));
      return raw;
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Renders a string that may contain <b>...</b> as inline JSX. */
export function T({ k, vars, className }: { k: string; vars?: Record<string, string | number>; className?: string }) {
  const { t } = useI18n();
  const raw = t(k, vars);
  if (!raw.includes("<b>")) return <span className={className}>{raw}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: raw }} />;
}

export function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Idioma"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{LOCALE_LABELS[locale].native}</span>
          <span className="sm:hidden">{locale.toUpperCase()}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] rounded-2xl">
        {SUPPORTED.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => setLocale(l)}
            className="cursor-pointer rounded-xl"
          >
            <span className="mr-2">{LOCALE_LABELS[l].flag}</span>
            <span className="flex-1">{LOCALE_LABELS[l].native}</span>
            {l === locale && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
