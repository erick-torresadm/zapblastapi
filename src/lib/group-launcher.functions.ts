import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseGroupInviteCode, inviteInfoGroup } from "@/lib/evolution.server";

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "g";
}

async function uniqueSlug(supabase: any, base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data } = await supabase.from("group_campaigns").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 6)}`;
}

async function resolveInstanceServer(supabase: any, instanceId: string) {
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("id, instance_name, server_id")
    .eq("id", instanceId)
    .maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin
    .from("evolution_servers")
    .select("base_url, api_key")
    .eq("id", inst.server_id)
    .maybeSingle();
  if (!srv) throw new Error("Servidor Evolution não encontrado");
  return { inst, server: { base_url: srv.base_url, api_key: srv.api_key } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const listGroupCampaignsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("group_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getGroupCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: campaign, error } = await supabase
      .from("group_campaigns")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) throw new Error("Campanha não encontrada");
    const { data: links } = await supabase
      .from("group_campaign_links")
      .select("*")
      .eq("campaign_id", data.id)
      .order("position", { ascending: true });
    const { data: jobs } = await supabase
      .from("group_create_jobs")
      .select("id,status,attempts,last_error,subject,created_at")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { campaign, links: links ?? [], jobs: jobs ?? [] };
  });

export const createGroupCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; member_limit?: number; instance_id?: string | null; default_description?: string; default_image_url?: string }) =>
    z.object({
      name: z.string().min(2).max(80),
      member_limit: z.number().int().min(50).max(1024).optional(),
      instance_id: z.string().uuid().nullable().optional(),
      default_description: z.string().max(2000).optional(),
      default_image_url: z.string().url().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = await uniqueSlug(supabase, data.name);
    const { data: row, error } = await supabase
      .from("group_campaigns")
      .insert({
        owner_user_id: userId,
        name: data.name,
        slug,
        member_limit: data.member_limit ?? 950,
        instance_id: data.instance_id ?? null,
        default_description: data.default_description ?? null,
        default_image_url: data.default_image_url ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateGroupCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name?: string; member_limit?: number; instance_id?: string | null; default_description?: string | null; default_image_url?: string | null; is_active?: boolean; slug?: string }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(80).optional(),
      member_limit: z.number().int().min(50).max(1024).optional(),
      instance_id: z.string().uuid().nullable().optional(),
      default_description: z.string().max(2000).nullable().optional(),
      default_image_url: z.string().url().nullable().optional(),
      is_active: z.boolean().optional(),
      slug: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("group_campaigns")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteGroupCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Bulk create groups (enqueue jobs)
// ─────────────────────────────────────────────────────────────────────────────

export const enqueueBulkCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { campaign_id: string; count: number; subject_template: string; description?: string; image_url?: string }) =>
    z.object({
      campaign_id: z.string().uuid(),
      count: z.number().int().min(1).max(100),
      subject_template: z.string().min(2).max(120),
      description: z.string().max(2000).optional(),
      image_url: z.string().url().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign } = await supabase
      .from("group_campaigns")
      .select("id, instance_id")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada");
    if (!campaign.instance_id) throw new Error("Selecione uma instância (chip) na campanha antes de criar grupos.");

    // figure out starting position
    const { data: maxRow } = await supabase
      .from("group_campaign_links")
      .select("position")
      .eq("campaign_id", data.campaign_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const startPos = (maxRow?.position ?? 0) + 1;

    const rows = Array.from({ length: data.count }, (_, idx) => {
      const n = idx + 1;
      const subject = data.subject_template.replace(/\{n\}/gi, String(n).padStart(2, "0"));
      return {
        campaign_id: data.campaign_id,
        owner_user_id: userId,
        subject,
        description: data.description ?? null,
        image_url: data.image_url ?? null,
        next_attempt_at: new Date(Date.now() + idx * 2500).toISOString(),
      };
    });
    const { error } = await supabase.from("group_create_jobs").insert(rows);
    if (error) throw error;
    return { enqueued: rows.length, start_position: startPos };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Paste invite links
// ─────────────────────────────────────────────────────────────────────────────

export const pasteGroupLinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { campaign_id: string; raw: string }) =>
    z.object({ campaign_id: z.string().uuid(), raw: z.string().min(5).max(20000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: campaign } = await supabase
      .from("group_campaigns")
      .select("id, instance_id")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada");

    const lines = data.raw.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const codes = Array.from(new Set(lines.map(parseGroupInviteCode).filter((c): c is string => !!c)));
    if (!codes.length) throw new Error("Nenhum link de convite válido encontrado");

    const { data: maxRow } = await supabase
      .from("group_campaign_links")
      .select("position")
      .eq("campaign_id", data.campaign_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let pos = (maxRow?.position ?? 0) + 1;

    // Best-effort: try to fetch group info via the campaign's instance (if any)
    let server: { base_url: string; api_key: string } | null = null;
    let instanceName: string | null = null;
    if (campaign.instance_id) {
      try {
        const r = await resolveInstanceServer(supabase, campaign.instance_id);
        server = r.server;
        instanceName = r.inst.instance_name;
      } catch { /* ignore */ }
    }

    type LinkInsert = {
      campaign_id: string; source: "pasted" | "created"; invite_code: string; invite_url: string;
      group_jid: string | null; title: string | null; member_count: number; position: number;
      status: "pending" | "active" | "full" | "broken" | "archived"; last_checked_at: string | null;
    };
    const rows: LinkInsert[] = [];
    for (const code of codes) {
      let title: string | null = null;
      let members = 0;
      let jid: string | null = null;
      if (server && instanceName) {
        try {
          const info = await inviteInfoGroup(server, instanceName, code);
          title = info.subject ?? null;
          members = info.size ?? (info.participants?.length ?? 0);
          jid = info.id ?? null;
        } catch { /* silently fall back */ }
      }
      rows.push({
        campaign_id: data.campaign_id,
        source: "pasted",
        invite_code: code,
        invite_url: `https://chat.whatsapp.com/${code}`,
        group_jid: jid,
        title,
        member_count: members,
        position: pos++,
        status: "active",
        last_checked_at: title ? new Date().toISOString() : null,
      });
    }

    const { error } = await supabase.from("group_campaign_links").insert(rows);
    if (error) throw error;
    return { inserted: rows.length };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Link maintenance
// ─────────────────────────────────────────────────────────────────────────────

export const updateGroupLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; status?: string; position?: number; title?: string }) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "active", "full", "broken", "archived"]).optional(),
      position: z.number().int().min(0).optional(),
      title: z.string().max(120).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("group_campaign_links").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteGroupLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("group_campaign_links").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
