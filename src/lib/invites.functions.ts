import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genToken(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const listInviteLinksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_invite_links")
      .select("*")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createInviteLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role: "agent" | "admin" | "viewer"; display_name?: string; max_uses?: number | null; expires_at?: string | null }) =>
    z.object({
      role: z.enum(["agent", "admin", "viewer"]),
      display_name: z.string().max(120).optional().default(""),
      max_uses: z.number().int().min(1).max(1000).optional().nullable().default(null),
      expires_at: z.string().datetime().optional().nullable().default(null),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const token = genToken(24);
    const { data: row, error } = await context.supabase
      .from("crm_invite_links")
      .insert({
        owner_user_id: context.userId,
        token,
        role: data.role,
        display_name: data.display_name || null,
        max_uses: data.max_uses,
        expires_at: data.expires_at,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeInviteLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_invite_links")
      .update({ active: false })
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewInviteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: z.string().min(8).max(64).parse(input.token) }))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: result, error } = await supabase.rpc("preview_invite_link", { _token: data.token });
    if (error) throw new Error(error.message);
    return result as { valid: boolean; message?: string; role?: string; owner_name?: string; display_name?: string };
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => ({ token: z.string().min(8).max(64).parse(input.token) }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("accept_invite_link", { _token: data.token });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; message?: string; owner_user_id?: string; role?: string };
  });
