import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Enfileira mensagens (renderiza spintax + variáveis) e marca campanha como "running" ou "scheduled".
export const startCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { renderSpintax } = await import("@/lib/spintax");

    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", data.campaign_id).maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada");
    if (campaign.user_id !== userId) throw new Error("Não autorizado");

    // Verifica chips selecionados conectados
    if (!campaign.instance_ids?.length) throw new Error("Selecione ao menos um chip");
    const { count: connectedCount } = await supabase.from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .in("id", campaign.instance_ids)
      .eq("status", "connected");
    if (!connectedCount) throw new Error("Nenhum dos chips selecionados está conectado");

    // Se ainda em rascunho, enfileira mensagens
    if (campaign.status === "draft") {
      if (!campaign.message_template && !campaign.flow_id) {
        throw new Error("Defina uma mensagem ou selecione um fluxo");
      }

      // Resolve template: mensagem própria OU primeira mensagem do fluxo
      let template = campaign.message_template as string | null;
      if (!template && campaign.flow_id) {
        const { data: flow } = await supabase.from("flows").select("current_version_id, draft_nodes").eq("id", campaign.flow_id).maybeSingle();
        let nodes: Array<{ type?: string; data?: { message?: string } }> = [];
        if (flow?.current_version_id) {
          const { data: ver } = await supabase.from("flow_versions").select("nodes").eq("id", flow.current_version_id).maybeSingle();
          nodes = (ver?.nodes as typeof nodes) ?? [];
        }
        if (!nodes.length) nodes = (flow?.draft_nodes as typeof nodes) ?? [];
        const first = nodes.find((n) => n?.data?.message);
        template = first?.data?.message ?? null;
        if (!template) throw new Error("O fluxo selecionado não tem mensagem inicial");
      }

      const { data: contacts } = await supabase.from("contacts")
        .select("id, phone, variables")
        .eq("list_id", campaign.list_id)
        .eq("opted_out", false);
      if (!contacts?.length) throw new Error("Lista vazia ou todos opted-out");

      // Filtra opt-outs globais
      const { data: optOuts } = await supabase.from("opt_outs").select("phone").eq("user_id", userId);
      const blocked = new Set((optOuts ?? []).map((o) => o.phone));

      const rows = contacts.filter((c) => !blocked.has(c.phone)).map((c) => ({
        user_id: userId,
        campaign_id: campaign.id,
        contact_id: c.id,
        phone: c.phone,
        rendered_message: renderSpintax(template!, (c.variables ?? {}) as Record<string, string>),
        status: "pending" as const,
      }));

      if (!rows.length) throw new Error("Todos contatos estão na lista de bloqueio");

      // Insere em chunks
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase.from("campaign_messages").insert(rows.slice(i, i + chunk));
        if (error) throw new Error(error.message);
      }

      await supabase.from("campaigns").update({
        total_messages: rows.length,
        status: campaign.scheduled_for ? "scheduled" : "running",
        started_at: campaign.scheduled_for ? null : new Date().toISOString(),
      }).eq("id", campaign.id);
    } else {
      // Resume: apenas muda status
      await supabase.from("campaigns").update({
        status: campaign.scheduled_for && new Date(campaign.scheduled_for) > new Date() ? "scheduled" : "running",
      }).eq("id", campaign.id);
    }

    return { ok: true };
  });

export const pauseCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { campaign_id: string }) => z.object({ campaign_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("campaigns").update({ status: "paused" })
      .eq("id", data.campaign_id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
