// Tool credits: free uses granted by coupons or plan quota.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getToolCreditsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_tool_credits_balance", {});
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });

export const redeemToolCreditCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string }) =>
    z.object({ code: z.string().trim().min(2).max(50) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("redeem_tool_credit_coupon", { _code: data.code });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; tool?: string; granted?: number; message?: string };
  });

type LeadInput = {
  name: string;
  phone: string;
  address?: string | null;
  website?: string | null;
  category?: string | null;
};

export const pushMapsLeadsToListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { list_name: string; leads: LeadInput[] }) =>
    z.object({
      list_name: z.string().trim().min(2).max(120),
      leads: z.array(z.object({
        name: z.string().max(200),
        phone: z.string().min(8).max(20),
        address: z.string().max(500).nullable().optional(),
        website: z.string().max(500).nullable().optional(),
        category: z.string().max(120).nullable().optional(),
      })).min(1).max(500),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: list, error: listErr } = await supabase
      .from("contact_lists")
      .insert({ user_id: userId, name: data.list_name, total_count: 0 })
      .select("id")
      .single();
    if (listErr) throw new Error(`Falha ao criar lista: ${listErr.message}`);

    // Dedupe phones (digits only, length 10-15)
    const seen = new Set<string>();
    let invalidCount = 0;
    let dupCount = 0;
    const rows = [] as Array<{
      user_id: string; list_id: string; phone: string; variables: Record<string, string>;
    }>;
    for (const l of data.leads) {
      const digits = String(l.phone).replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) { invalidCount++; continue; }
      if (seen.has(digits)) { dupCount++; continue; }
      seen.add(digits);
      const first = (l.name ?? "").split(/\s+/)[0] ?? "";
      rows.push({
        user_id: userId,
        list_id: list.id,
        phone: digits,
        variables: {
          nome: l.name ?? "",
          primeiro_nome: first,
          empresa: l.name ?? "",
          endereco: l.address ?? "",
          site: l.website ?? "",
          categoria: l.category ?? "",
        },
      });
    }

    if (rows.length === 0) {
      await supabase.from("contact_lists").delete().eq("id", list.id);
      throw new Error(
        `Nenhum telefone válido nos leads selecionados (${invalidCount} inválidos, ${dupCount} duplicados). Selecione leads que tenham telefone.`,
      );
    }

    const { error: cErr } = await supabase.from("contacts").insert(rows);
    if (cErr) {
      await supabase.from("contact_lists").delete().eq("id", list.id);
      throw new Error(`Falha ao salvar contatos: ${cErr.message}`);
    }

    await supabase.from("contact_lists").update({ total_count: rows.length }).eq("id", list.id);

    return {
      list_id: list.id as string,
      list_name: data.list_name,
      inserted: rows.length,
      skipped_invalid: invalidCount,
      skipped_duplicates: dupCount,
    };
  });

