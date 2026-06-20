import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWalletFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: wallet } = await supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    const { data: tx } = await supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(50);
    return { wallet: wallet ?? { user_id: userId, balance_cents: 0, total_topped_up_cents: 0 }, transactions: tx ?? [] };
  });
