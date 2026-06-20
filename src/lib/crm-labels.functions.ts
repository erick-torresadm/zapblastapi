// CRUD de etiquetas (labels) do CRM
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listLabelsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspace: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const owner = data.workspace ?? context.userId;
    const { data: rows, error } = await context.supabase
      .from("crm_labels")
      .select("id,name,color,sort_order")
      .eq("owner_user_id", owner)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveLabelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    workspace: z.string().uuid().optional(),
    name: z.string().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    sort_order: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const owner = data.workspace ?? context.userId;
    if (data.id) {
      const { error } = await context.supabase
        .from("crm_labels")
        .update({ name: data.name, color: data.color, sort_order: data.sort_order ?? 0 })
        .eq("id", data.id).eq("owner_user_id", owner);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("crm_labels")
        .insert({ owner_user_id: owner, name: data.name, color: data.color, sort_order: data.sort_order ?? 0 });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteLabelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_labels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationLabelsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    label_ids: z.array(z.string().uuid()).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_conversations")
      .update({ label_ids: data.label_ids })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const snoozeConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    snoozed_until: z.string().datetime().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_conversations")
      .update({ snoozed_until: data.snoozed_until })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
