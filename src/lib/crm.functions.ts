// CRM: equipe (agents), conversas (atribuição, status, transferência) e notas internas.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ----- Equipe -----
export const listAgentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("crm_agents" as any)
      .select("id,owner_user_id,agent_user_id,role,display_name,active,created_at")
      .eq("owner_user_id", userId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const myWorkspacesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("crm_agents" as any)
      .select("owner_user_id,role,display_name")
      .eq("agent_user_id", userId).eq("active", true);
    return data ?? [];
  });

export const addAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    email: z.string().email(),
    role: z.enum(["admin", "agent"]).default("agent"),
    display_name: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // procura usuário pelo email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = users.users.find((u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase());
    if (!found) throw new Error("Usuário com esse e-mail não está cadastrado na plataforma. Peça para criar uma conta primeiro.");
    if (found.id === userId) throw new Error("Você já é o dono da workspace");

    const { error } = await supabase.from("crm_agents" as any).insert({
      owner_user_id: userId,
      agent_user_id: found.id,
      role: data.role,
      display_name: data.display_name ?? found.email ?? null,
      active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    role: z.enum(["admin", "agent"]).optional(),
    active: z.boolean().optional(),
    display_name: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.role) patch.role = data.role;
    if (typeof data.active === "boolean") patch.active = data.active;
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    const { error } = await context.supabase
      .from("crm_agents" as any).update(patch)
      .eq("id", data.id).eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_agents" as any)
      .delete().eq("id", data.id).eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Conversas -----
const statusSchema = z.enum(["open", "pending", "resolved"]);

export const listConversationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workspace: z.string().uuid().optional(),
      status: statusSchema.optional(),
      filter: z.enum(["all", "mine", "queue"]).default("all"),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("crm_conversations" as any)
      .select("id,owner_user_id,instance_id,contact_phone,contact_name,assigned_agent_id,status,last_message_at,last_message_text,last_message_direction,unread_count")
      .order("last_message_at", { ascending: false })
      .limit(300);
    if (data.workspace) q = q.eq("owner_user_id", data.workspace);
    if (data.status) q = q.eq("status", data.status);
    if (data.filter === "mine") q = q.eq("assigned_agent_id", userId);
    else if (data.filter === "queue") q = q.is("assigned_agent_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const assignConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    agent_user_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_conversations" as any)
      .update({ assigned_agent_id: data.agent_user_id })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const claimConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_conversations" as any)
      .update({ assigned_agent_id: context.userId })
      .eq("id", data.conversation_id)
      .is("assigned_agent_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    status: statusSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_conversations" as any)
      .update({ status: data.status })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationReadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("crm_conversations" as any)
      .update({ unread_count: 0 }).eq("id", data.conversation_id);
    return { ok: true };
  });

// ----- Notas -----
export const listNotesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("crm_notes" as any)
      .select("id,author_user_id,text,created_at")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true });
    return rows ?? [];
  });

export const addNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    text: z.string().min(1).max(2000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase.from("crm_conversations" as any)
      .select("owner_user_id").eq("id", data.conversation_id).maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    const { error } = await supabase.from("crm_notes" as any).insert({
      conversation_id: data.conversation_id,
      owner_user_id: (conv as any).owner_user_id,
      author_user_id: userId,
      text: data.text,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
