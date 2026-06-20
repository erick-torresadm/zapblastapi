import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function pubClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const getPublicBusinessFn = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({
    slug: z.string().trim().toLowerCase().min(1).max(50).parse(input.slug),
  }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_get_business", { _slug: data.slug });
    if (error) throw new Error(error.message);
    return result as {
      found: boolean;
      business?: { id: string; name: string; about: string | null; timezone: string; primary_color: string | null };
      services?: Array<{ id: string; name: string; description: string | null; duration_min: number; price_cents: number; professional_ids: string[] }>;
      professionals?: Array<{ id: string; name: string; color: string | null; avatar_url: string | null }>;
    };
  });

export const getPublicSlotsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { business_id: string; service_id: string; professional_id: string; date: string }) => ({
    business_id: z.string().uuid().parse(input.business_id),
    service_id: z.string().uuid().parse(input.service_id),
    professional_id: z.string().uuid().parse(input.professional_id),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.date),
  }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_get_slots", {
      _business_id: data.business_id,
      _service_id: data.service_id,
      _professional_id: data.professional_id,
      _date: data.date,
    });
    if (error) throw new Error(error.message);
    return (result as Array<{ starts_at: string; ends_at: string }>) ?? [];
  });

export const bookAppointmentFn = createServerFn({ method: "POST" })
  .inputValidator((input: {
    business_id: string; service_id: string; professional_id: string;
    starts_at: string; customer_name: string; customer_phone: string; customer_notes?: string;
  }) => ({
    business_id: z.string().uuid().parse(input.business_id),
    service_id: z.string().uuid().parse(input.service_id),
    professional_id: z.string().uuid().parse(input.professional_id),
    starts_at: input.starts_at,
    customer_name: z.string().trim().min(2).max(100).parse(input.customer_name),
    customer_phone: z.string().trim().min(8).max(20).parse(input.customer_phone),
    customer_notes: input.customer_notes?.slice(0, 500) ?? null,
  }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_book", {
      _business_id: data.business_id,
      _service_id: data.service_id,
      _professional_id: data.professional_id,
      _starts_at: data.starts_at,
      _customer_name: data.customer_name,
      _customer_phone: data.customer_phone,
      _customer_notes: data.customer_notes,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; message?: string; appointment_id?: string; confirm_token?: string };
  });

export const getAppointmentByTokenFn = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: z.string().uuid().parse(input.token) }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_get_by_token", { _token: data.token });
    if (error) throw new Error(error.message);
    return result as { found: boolean; appointment?: Record<string, unknown> };
  });

export const confirmAppointmentFn = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; by: "customer" | "professional" }) => ({
    token: z.string().uuid().parse(input.token),
    by: input.by,
  }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_confirm", { _token: data.token, _by: data.by });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; status?: string; message?: string };
  });

export const cancelAppointmentByTokenFn = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: z.string().uuid().parse(input.token) }))
  .handler(async ({ data }) => {
    const { data: result, error } = await pubClient().rpc("agenda_public_cancel", { _token: data.token });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; message?: string };
  });
