import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getWalletFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: wallet } = await supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    const { data: tx } = await supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(50);
    return { wallet: wallet ?? { user_id: userId, balance_cents: 0, total_topped_up_cents: 0 }, transactions: tx ?? [] };
  });

// MOCK topup — vai virar Stripe Checkout na Fase B
export const mockTopupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { amount_cents: number }) =>
    z.object({ amount_cents: z.number().int().min(500).max(100000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("credit_wallet", {
      _user_id: userId,
      _amount_cents: data.amount_cents,
      _type: "topup",
      _description: "Recarga manual (DEV)",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
