// Worker de aquecimento: dispara mensagens entre chips do mesmo usuário e processa respostas pendentes.
// Chamado por pg_cron a cada minuto. Bypassa auth (rota /api/public/*).
import { createFileRoute } from "@tanstack/react-router";
import { renderSpintax } from "@/lib/spintax";

type Intensity = "leve" | "medio" | "forte";
type Category = "saudacao" | "pergunta" | "resposta" | "casual" | "emoji" | "despedida";

const QUOTAS: Record<Intensity, number> = { leve: 20, medio: 50, forte: 100 };
// Ramp-up por dia (multiplicador da quota)
function rampMultiplier(day: number): number {
  if (day <= 1) return 0.3;
  if (day <= 3) return 0.5;
  if (day <= 5) return 0.75;
  return 1;
}
function isWithinHumanHours(): boolean {
  // 8h-22h horário de Brasília (UTC-3)
  const utcHour = new Date().getUTCHours();
  const brHour = (utcHour - 3 + 24) % 24;
  return brHour >= 8 && brHour < 22;
}
function warmupDay(startedAt: string | null): number {
  if (!startedAt) return 1;
  const diff = Date.now() - new Date(startedAt).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}
function pickCategory(): Category {
  const r = Math.random();
  if (r < 0.35) return "saudacao";
  if (r < 0.55) return "pergunta";
  if (r < 0.75) return "casual";
  if (r < 0.9) return "emoji";
  return "despedida";
}

type InstanceRow = {
  id: string;
  user_id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  warmup_enabled: boolean;
  warmup_intensity: Intensity;
  warmup_started_at: string | null;
  warmup_sent_today: number;
  warmup_total_sent: number;
  warmup_last_at: string | null;
  health_score: number;
  warmup_pool_opt_in: boolean;
  evolution_servers: { base_url: string; api_key: string } | null;
};


export const Route = createFileRoute("/api/public/warmup-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.CRON_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!isWithinHumanHours()) {
          return Response.json({ skipped: "outside_human_hours" });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendText } = await import("@/lib/evolution.server");

        // Reset diário
        await supabaseAdmin.from("whatsapp_instances")
          .update({ warmup_sent_today: 0, warmup_received_today: 0 })
          .lt("last_reset_date", new Date().toISOString().slice(0, 10));

        let sent = 0, replies = 0, skipped = 0, errors = 0;

        // ============= 1) RESPOSTAS PENDENTES =============
        const { data: dueReplies } = await supabaseAdmin
          .from("warmup_conversations")
          .select("*")
          .eq("replied", false)
          .not("reply_due_at", "is", null)
          .lte("reply_due_at", new Date().toISOString())
          .limit(20);

        for (const convo of dueReplies ?? []) {
          // Carrega chip que vai responder (to_instance) e destino (from_instance.phone)
          const { data: toInst } = await supabaseAdmin.from("whatsapp_instances")
            .select("*, evolution_servers(base_url, api_key)")
            .eq("id", convo.to_instance_id).maybeSingle();
          const { data: fromInst } = await supabaseAdmin.from("whatsapp_instances")
            .select("phone_number").eq("id", convo.from_instance_id).maybeSingle();
          const ti = toInst as InstanceRow | null;
          if (!ti || ti.status !== "connected" || !ti.evolution_servers || !fromInst?.phone_number) {
            await supabaseAdmin.from("warmup_conversations").update({ replied: true }).eq("id", convo.id);
            skipped++; continue;
          }
          // Sorteia resposta
          const replyMsg = await pickMessage(supabaseAdmin, ti.user_id, "resposta");
          if (!replyMsg) { skipped++; continue; }
          try {
            const evoRes = await sendText(
              { base_url: ti.evolution_servers.base_url, api_key: ti.evolution_servers.api_key },
              ti.instance_name, fromInst.phone_number, replyMsg,
            );
            const evoId = (evoRes as { key?: { id?: string } })?.key?.id ?? null;
            await supabaseAdmin.from("warmup_conversations").update({ replied: true }).eq("id", convo.id);
            await supabaseAdmin.from("warmup_conversations").insert({
              user_id: ti.user_id,
              from_instance_id: ti.id,
              to_instance_id: convo.from_instance_id,
              category: "resposta",
              message: replyMsg,
              evolution_message_id: evoId,
            });
            await bumpInstanceStats(supabaseAdmin, ti.id, ti.warmup_sent_today, ti.warmup_total_sent, ti.health_score);
            replies++;
          } catch {
            errors++;
            await supabaseAdmin.from("warmup_conversations").update({ replied: true }).eq("id", convo.id);
          }
        }

        // ============= 2) NOVAS CONVERSAS =============
        // Pega todos os usuários com 2+ chips em modo aquecimento conectados
        const { data: allInst } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("*, evolution_servers(base_url, api_key)")
          .eq("warmup_enabled", true)
          .eq("status", "connected")
          .not("phone_number", "is", null);

        const byUser = new Map<string, InstanceRow[]>();
        for (const i of (allInst as InstanceRow[] | null) ?? []) {
          if (!byUser.has(i.user_id)) byUser.set(i.user_id, []);
          byUser.get(i.user_id)!.push(i);
        }

        // Pool global de chips opt-in (de qualquer cliente) — usado quando o usuário tem só 1 chip
        // ou aleatoriamente para diversificar conversas (~40% das vezes quando opt-in).
        const poolChips = ((allInst as InstanceRow[] | null) ?? []).filter((c) => c.warmup_pool_opt_in);

        for (const [userId, chips] of byUser) {
          const optInChips = chips.filter((c) => c.warmup_pool_opt_in);
          const hasMultiple = chips.length >= 2;
          if (!hasMultiple && optInChips.length === 0) { skipped++; continue; }

          // Escolhe chip "from" com quota disponível
          const eligible = chips.filter((c) => {
            const day = warmupDay(c.warmup_started_at);
            const quota = Math.ceil(QUOTAS[c.warmup_intensity] * rampMultiplier(day));
            return c.warmup_sent_today < quota;
          });
          if (eligible.length === 0) { skipped++; continue; }

          const now = Date.now();
          const ready = eligible.filter((c) => !c.warmup_last_at || (now - new Date(c.warmup_last_at).getTime()) > 180000);
          if (ready.length === 0) { skipped++; continue; }

          const fromChip = ready[Math.floor(Math.random() * ready.length)];

          // Decide se busca parceiro no pool global ou entre chips próprios.
          // Pool é usado se: (a) só tem 1 chip próprio, OU (b) fromChip está no pool e sorteio < 40%.
          const usePool = fromChip.warmup_pool_opt_in && (chips.length === 1 || Math.random() < 0.4);
          let toCandidates: InstanceRow[];
          if (usePool) {
            toCandidates = poolChips.filter((c) => c.user_id !== userId && c.id !== fromChip.id && c.phone_number);
          } else {
            toCandidates = chips.filter((c) => c.id !== fromChip.id && c.phone_number);
          }
          if (toCandidates.length === 0) { skipped++; continue; }
          const toChip = toCandidates[Math.floor(Math.random() * toCandidates.length)];
          if (!toChip.phone_number || !fromChip.evolution_servers) { skipped++; continue; }

          const category = pickCategory();
          const msg = await pickMessage(supabaseAdmin, fromChip.user_id, category);
          if (!msg) { skipped++; continue; }

          try {
            const evoRes = await sendText(
              { base_url: fromChip.evolution_servers.base_url, api_key: fromChip.evolution_servers.api_key },
              fromChip.instance_name, toChip.phone_number, msg,
            );
            const evoId = (evoRes as { key?: { id?: string } })?.key?.id ?? null;
            const wantsReply = category === "saudacao" || category === "pergunta";
            const replyDelay = wantsReply ? 15000 + Math.random() * 165000 : null;
            await supabaseAdmin.from("warmup_conversations").insert({
              user_id: fromChip.user_id,
              from_instance_id: fromChip.id,
              to_instance_id: toChip.id,
              category,
              message: msg,
              evolution_message_id: evoId,
              reply_due_at: replyDelay ? new Date(Date.now() + replyDelay).toISOString() : null,
              replied: replyDelay ? false : true,
            });
            await bumpInstanceStats(supabaseAdmin, fromChip.id, fromChip.warmup_sent_today, fromChip.warmup_total_sent, fromChip.health_score);
            sent++;
          } catch {
            errors++;
          }
        }


        return Response.json({ sent, replies, skipped, errors });
      },
    },
  },
});

async function pickMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  category: Category,
): Promise<string | null> {
  const { data } = await sb.from("warmup_messages")
    .select("content, weight")
    .eq("category", category)
    .eq("active", true)
    .or(`user_id.is.null,user_id.eq.${userId}`);
  const rows = (data ?? []) as Array<{ content: string; weight: number }>;
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Math.max(1, r.weight), 0);
  let r = Math.random() * total;
  for (const row of rows) {
    r -= Math.max(1, row.weight);
    if (r <= 0) return renderSpintax(row.content);
  }
  return renderSpintax(rows[rows.length - 1].content);
}

async function bumpInstanceStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  id: string,
  sentToday: number,
  totalSent: number,
  health: number,
) {
  await sb.from("whatsapp_instances").update({
    warmup_sent_today: sentToday + 1,
    warmup_total_sent: totalSent + 1,
    warmup_last_at: new Date().toISOString(),
    health_score: Math.min(100, health + 1),
  }).eq("id", id);
}
