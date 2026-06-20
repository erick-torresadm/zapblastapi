// Traffic module — CRUD protegido (authenticated)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const slugRx = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

// ===== Funnels =====
export const listFunnelsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("traffic_funnels")
      .select("id,slug,title,status,template,custom_domain,updated_at,created_at")
      .eq("owner_user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getFunnelFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: uuid.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const [{ data: f, error: fe }, { data: steps }, { data: blocks }, { data: logic }, { data: domains }] = await Promise.all([
      context.supabase.from("traffic_funnels").select("*").eq("id", data.id).eq("owner_user_id", context.userId).maybeSingle(),
      context.supabase.from("traffic_steps").select("*").eq("funnel_id", data.id).order("position"),
      context.supabase.from("traffic_blocks").select("*").eq("funnel_id", data.id).order("position"),
      context.supabase.from("traffic_logic").select("*").eq("funnel_id", data.id).order("position"),
      context.supabase.from("traffic_custom_domains").select("*").eq("funnel_id", data.id),
    ]);
    if (fe) throw new Error(fe.message);
    if (!f) throw new Error("Funil não encontrado");
    return {
      funnel: f,
      steps: steps ?? [],
      blocks: blocks ?? [],
      logic: logic ?? [],
      domains: domains ?? [],
    };
  });

export const createFunnelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { slug: string; title: string; template: "funnel" | "linkbio" | "quiz" }) => ({
    slug: z.string().trim().toLowerCase().regex(slugRx, "Slug inválido").parse(i.slug),
    title: z.string().trim().min(2).max(80).parse(i.title),
    template: z.enum(["funnel", "linkbio", "quiz"]).parse(i.template),
  }))
  .handler(async ({ data, context }) => {
    const { data: f, error } = await context.supabase
      .from("traffic_funnels")
      .insert({
        owner_user_id: context.userId,
        slug: data.slug,
        title: data.title,
        template: data.template,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Seed: cria steps + blocks de cada step, dependendo do template
    if (data.template === "linkbio") {
      // 1 step só, com blocos de link-in-bio
      const { data: step } = await context.supabase.from("traffic_steps").insert({
        funnel_id: f.id, position: 0, name: "Link-in-bio", type: "intro",
      }).select().single();
      if (step) {
        await context.supabase.from("traffic_blocks").insert([
          { funnel_id: f.id, step_id: step.id, type: "headline", position: 0, props: { text: data.title, align: "center" } },
          { funnel_id: f.id, step_id: step.id, type: "text", position: 1, props: { text: "Escolha uma opção abaixo:", align: "center" } },
          { funnel_id: f.id, step_id: step.id, type: "button-whatsapp", position: 2, props: { label: "Falar no WhatsApp", phone: "" } },
        ] as any);
      }
    } else {
      // funnel / quiz: 3 páginas (intro, pergunta, captura)
      const { data: stepsCreated } = await context.supabase.from("traffic_steps").insert([
        { funnel_id: f.id, position: 0, name: "Boas-vindas", type: "intro" },
        { funnel_id: f.id, position: 1, name: "Pergunta 1", type: "question" },
        { funnel_id: f.id, position: 2, name: "Captura", type: "form" },
      ]).select();
      if (stepsCreated && stepsCreated.length === 3) {
        const [s0, s1, s2] = stepsCreated;
        await context.supabase.from("traffic_blocks").insert([
          // intro
          { funnel_id: f.id, step_id: s0.id, type: "headline", position: 0, props: { text: data.title, align: "center", size: "2xl" } },
          { funnel_id: f.id, step_id: s0.id, type: "text", position: 1, props: { text: "Responda 3 perguntas rápidas para receber sua oferta personalizada.", align: "center" } },
          { funnel_id: f.id, step_id: s0.id, type: "button-next", position: 2, props: { label: "Começar agora 👉", style: "primary" } },
          // question
          { funnel_id: f.id, step_id: s1.id, type: "headline", position: 0, props: { text: "Qual é o seu objetivo principal?", align: "center", size: "xl" } },
          { funnel_id: f.id, step_id: s1.id, type: "choice", position: 1, field_key: "objetivo", props: {
            label: "",
            options: [
              { value: "emagrecer", label: "Emagrecer", image: "" },
              { value: "ganhar_massa", label: "Ganhar massa", image: "" },
              { value: "saude", label: "Saúde geral", image: "" },
            ],
            layout: "grid", autoNext: true,
          } },
          // form
          { funnel_id: f.id, step_id: s2.id, type: "headline", position: 0, props: { text: "Receba sua oferta personalizada", align: "center", size: "xl" } },
          { funnel_id: f.id, step_id: s2.id, type: "form", position: 1, props: { title: "", submitLabel: "Quero receber", fields: ["name", "phone"] } },
        ] as any);
      }
    }
    return f;
  });


export const updateFunnelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    id: string;
    title?: string;
    status?: "draft" | "published";
    primary_color?: string;
    font_family?: string;
    seo_title?: string | null;
    seo_description?: string | null;
    og_image_url?: string | null;
    default_list_id?: string | null;
    settings?: Record<string, unknown>;
  }) => i)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: f, error } = await context.supabase
      .from("traffic_funnels")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", id)
      .eq("owner_user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return f;
  });

export const deleteFunnelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: uuid.parse(i.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("traffic_funnels")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Blocks =====
export const saveBlocksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnel_id: string; blocks: Array<{ id?: string; type: string; position: number; props: Record<string, unknown> }> }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    blocks: i.blocks,
  }))
  .handler(async ({ data, context }) => {
    // verifica ownership
    const { data: f } = await context.supabase
      .from("traffic_funnels").select("id").eq("id", data.funnel_id).eq("owner_user_id", context.userId).maybeSingle();
    if (!f) throw new Error("Funil não encontrado");
    // wipe & insert (simples e seguro)
    await context.supabase.from("traffic_blocks").delete().eq("funnel_id", data.funnel_id);
    if (data.blocks.length > 0) {
      const { error } = await context.supabase.from("traffic_blocks").insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.blocks.map((b, i) => ({ funnel_id: data.funnel_id, type: b.type, position: i, props: b.props })) as any
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ===== Custom Domains =====
export const upsertDomainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnel_id: string; host: string }) => ({
    funnel_id: uuid.parse(i.funnel_id),
    host: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domínio inválido").parse(i.host),
  }))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase
      .from("traffic_funnels").select("id").eq("id", data.funnel_id).eq("owner_user_id", context.userId).maybeSingle();
    if (!f) throw new Error("Funil não encontrado");
    // delete existing rows for this funnel (1 domain per funnel for MVP)
    await context.supabase.from("traffic_custom_domains").delete().eq("funnel_id", data.funnel_id);
    const { data: d, error } = await context.supabase
      .from("traffic_custom_domains")
      .insert({ funnel_id: data.funnel_id, host: data.host })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return d;
  });

export const removeDomainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { domain_id: string }) => ({ domain_id: uuid.parse(i.domain_id) }))
  .handler(async ({ data, context }) => {
    // RLS garante ownership via funnel
    const { error } = await context.supabase.from("traffic_custom_domains").delete().eq("id", data.domain_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyDomainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { domain_id: string }) => ({ domain_id: uuid.parse(i.domain_id) }))
  .handler(async ({ data, context }) => {
    const { data: d, error } = await context.supabase
      .from("traffic_custom_domains").select("*").eq("id", data.domain_id).maybeSingle();
    if (error || !d) throw new Error("Domínio não encontrado");
    // Realiza resolução DNS via DNS-over-HTTPS (Cloudflare 1.1.1.1)
    const txtHost = `_zapblast-verify.${d.host}`;
    const resp = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtHost)}&type=TXT`, {
      headers: { accept: "application/dns-json" },
    });
    const j = await resp.json() as { Answer?: Array<{ data: string }> };
    const found = (j.Answer ?? []).some((a) => a.data.replace(/"/g, "").includes(d.verify_token));
    if (!found) {
      return { ok: false, message: `Registro TXT em ${txtHost} ainda não encontrado.` };
    }
    await context.supabase.from("traffic_custom_domains")
      .update({ dns_ok: true, last_checked_at: new Date().toISOString() })
      .eq("id", d.id);
    await context.supabase.from("traffic_funnels")
      .update({ custom_domain: d.host })
      .eq("id", d.funnel_id);
    return { ok: true, message: "Domínio verificado!" };
  });

// ===== Analytics =====
export const getFunnelAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { funnel_id: string }) => ({ funnel_id: uuid.parse(i.funnel_id) }))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: events }, { data: leads }] = await Promise.all([
      context.supabase.from("traffic_events")
        .select("event_name,created_at,capi_status")
        .eq("funnel_id", data.funnel_id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      context.supabase.from("traffic_leads")
        .select("id,name,phone,email,utm,created_at")
        .eq("funnel_id", data.funnel_id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const totals = (events ?? []).reduce<Record<string, number>>((acc, e) => {
      acc[e.event_name] = (acc[e.event_name] ?? 0) + 1;
      return acc;
    }, {});
    return { totals, recentEvents: events ?? [], leads: leads ?? [] };
  });

// ===== Listas (para popular default_list_id) =====
export const listContactListsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_lists").select("id,name").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
