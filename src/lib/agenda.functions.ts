import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const slugRegex = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;

// ===================== Business =====================
export const getMyBusinessFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agenda_businesses")
      .select("*")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertBusinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    slug: string;
    name: string;
    about?: string | null;
    timezone?: string;
    default_instance_id?: string | null;
    confirm_offsets_minutes?: number[];
    notify_professional?: boolean;
    primary_color?: string | null;
    active?: boolean;
  }) => ({
    id: input.id ? uuid.parse(input.id) : undefined,
    slug: z.string().trim().toLowerCase().regex(slugRegex, "Slug inválido (a-z, 0-9, hífen)").parse(input.slug),
    name: z.string().trim().min(2).max(80).parse(input.name),
    about: input.about ?? null,
    timezone: input.timezone ?? "America/Sao_Paulo",
    default_instance_id: input.default_instance_id ?? null,
    confirm_offsets_minutes: (input.confirm_offsets_minutes ?? [1440, 120])
      .filter((n) => Number.isFinite(n) && n > 0 && n < 60 * 24 * 14),
    notify_professional: input.notify_professional ?? true,
    primary_color: input.primary_color ?? null,
    active: input.active ?? true,
  }))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_user_id: context.userId };
    const q = data.id
      ? context.supabase.from("agenda_businesses").update(row).eq("id", data.id).eq("owner_user_id", context.userId).select().single()
      : context.supabase.from("agenda_businesses").insert(row).select().single();
    const { data: result, error } = await q;
    if (error) throw new Error(error.message);
    return result;
  });

// ===================== Professionals =====================
export const listProfessionalsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { business_id: string }) => ({ business_id: uuid.parse(input.business_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_professionals")
      .select("*, agenda_service_professionals(service_id)")
      .eq("business_id", data.business_id)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertProfessionalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    business_id: string;
    name: string;
    phone?: string | null;
    color?: string | null;
    active?: boolean;
  }) => ({
    id: input.id ? uuid.parse(input.id) : undefined,
    business_id: uuid.parse(input.business_id),
    name: z.string().trim().min(2).max(80).parse(input.name),
    phone: input.phone ? input.phone.replace(/\D/g, "") : null,
    color: input.color ?? null,
    active: input.active ?? true,
  }))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_user_id: context.userId };
    const q = data.id
      ? context.supabase.from("agenda_professionals").update(row).eq("id", data.id).select().single()
      : context.supabase.from("agenda_professionals").insert(row).select().single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteProfessionalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: uuid.parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agenda_professionals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Services =====================
export const listServicesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { business_id: string }) => ({ business_id: uuid.parse(input.business_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_services")
      .select("*, agenda_service_professionals(professional_id)")
      .eq("business_id", data.business_id)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    business_id: string;
    name: string;
    description?: string | null;
    duration_min: number;
    price_cents: number;
    active?: boolean;
    professional_ids?: string[];
  }) => ({
    id: input.id ? uuid.parse(input.id) : undefined,
    business_id: uuid.parse(input.business_id),
    name: z.string().trim().min(2).max(80).parse(input.name),
    description: input.description ?? null,
    duration_min: z.number().int().min(5).max(8 * 60).parse(input.duration_min),
    price_cents: z.number().int().min(0).parse(input.price_cents),
    active: input.active ?? true,
    professional_ids: (input.professional_ids ?? []).map((id) => uuid.parse(id)),
  }))
  .handler(async ({ data, context }) => {
    const { professional_ids, ...rest } = data;
    const row = { ...rest, owner_user_id: context.userId };
    const q = data.id
      ? context.supabase.from("agenda_services").update(row).eq("id", data.id).select().single()
      : context.supabase.from("agenda_services").insert(row).select().single();
    const { data: svc, error } = await q;
    if (error) throw new Error(error.message);

    // sync N×N
    await context.supabase.from("agenda_service_professionals").delete().eq("service_id", svc.id);
    if (professional_ids.length) {
      const rows = professional_ids.map((pid) => ({ service_id: svc.id, professional_id: pid }));
      const { error: e2 } = await context.supabase.from("agenda_service_professionals").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return svc;
  });

export const deleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: uuid.parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agenda_services").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Availability =====================
export const listAvailabilityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { professional_id: string }) => ({ professional_id: uuid.parse(input.professional_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_availability")
      .select("*")
      .eq("professional_id", data.professional_id)
      .order("weekday").order("start_time");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setAvailabilityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    professional_id: string;
    windows: { weekday: number; start_time: string; end_time: string }[];
  }) => ({
    professional_id: uuid.parse(input.professional_id),
    windows: input.windows.map((w) => ({
      weekday: z.number().int().min(0).max(6).parse(w.weekday),
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).parse(w.start_time),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).parse(w.end_time),
    })),
  }))
  .handler(async ({ data, context }) => {
    await context.supabase.from("agenda_availability").delete().eq("professional_id", data.professional_id);
    if (data.windows.length) {
      const rows = data.windows.map((w) => ({ ...w, professional_id: data.professional_id, owner_user_id: context.userId }));
      const { error } = await context.supabase.from("agenda_availability").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ===================== Blocks =====================
export const createBlockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { professional_id: string; starts_at: string; ends_at: string; reason?: string }) => ({
    professional_id: uuid.parse(input.professional_id),
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    reason: input.reason ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { error, data: r } = await context.supabase.from("agenda_blocks")
      .insert({ ...data, owner_user_id: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteBlockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: uuid.parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agenda_blocks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBlocksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { professional_id: string }) => ({ professional_id: uuid.parse(input.professional_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_blocks").select("*")
      .eq("professional_id", data.professional_id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ===================== Appointments =====================
export const listAppointmentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { business_id: string; from: string; to: string }) => ({
    business_id: uuid.parse(input.business_id),
    from: input.from,
    to: input.to,
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_appointments")
      .select("*, agenda_services(name, duration_min), agenda_professionals(name, color)")
      .eq("business_id", data.business_id)
      .gte("starts_at", data.from)
      .lt("starts_at", data.to)
      .order("starts_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateAppointmentStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "pending"|"confirmed"|"cancelled"|"no_show"|"done" }) => ({
    id: uuid.parse(input.id),
    status: input.status,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenda_appointments").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.status === "cancelled") {
      await context.supabase.from("agenda_notifications")
        .update({ status: "cancelled" }).eq("appointment_id", data.id).eq("status", "queued");
    }
    return { ok: true };
  });

// ===================== Reengagement =====================
export const listReengagementFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { business_id: string }) => ({ business_id: uuid.parse(input.business_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agenda_reengagement_campaigns").select("*")
      .eq("business_id", data.business_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertReengagementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    business_id: string;
    name: string;
    message_template: string;
    coupon_code?: string | null;
    inactive_days: number;
    cadence: "every_7_days" | "every_15_days" | "every_30_days";
    active?: boolean;
  }) => ({
    id: input.id ? uuid.parse(input.id) : undefined,
    business_id: uuid.parse(input.business_id),
    name: z.string().trim().min(2).max(80).parse(input.name),
    message_template: z.string().trim().min(10).max(800).parse(input.message_template),
    coupon_code: input.coupon_code?.trim() || null,
    inactive_days: z.number().int().min(1).max(365).parse(input.inactive_days),
    cadence: input.cadence,
    active: input.active ?? true,
  }))
  .handler(async ({ data, context }) => {
    const row = { ...data, owner_user_id: context.userId };
    const q = data.id
      ? context.supabase.from("agenda_reengagement_campaigns").update(row).eq("id", data.id).select().single()
      : context.supabase.from("agenda_reengagement_campaigns").insert(row).select().single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteReengagementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: uuid.parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agenda_reengagement_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
