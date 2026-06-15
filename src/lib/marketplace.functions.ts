import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const buyChipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { catalog_item_id: string }) =>
    z.object({ catalog_item_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getChipProvider } = await import("@/lib/chip-providers");

    const { data: item, error: itemErr } = await supabase
      .from("chip_catalog").select("*").eq("id", data.catalog_item_id).eq("active", true).maybeSingle();
    if (itemErr || !item) throw new Error("Produto não disponível");

    // 1) Cria registro de compra pending
    const { data: purchase, error: purErr } = await supabaseAdmin.from("chip_purchases").insert({
      user_id: userId,
      catalog_item_id: item.id,
      price_paid_cents: item.price_cents,
      provider: item.provider,
      status: "pending",
    }).select().single();
    if (purErr || !purchase) throw new Error("Falha ao registrar compra");

    // 2) Debita carteira (atomicamente). Se falhar, marca purchase failed.
    const { error: debitErr } = await supabase.rpc("debit_wallet", {
      _amount_cents: item.price_cents,
      _description: `Compra: ${item.name}`,
      _chip_purchase_id: purchase.id,
    });
    if (debitErr) {
      await supabaseAdmin.from("chip_purchases").update({ status: "failed", error: "saldo insuficiente" }).eq("id", purchase.id);
      throw new Error(debitErr.message.includes("Saldo") ? "Saldo insuficiente. Adicione saldo na carteira." : debitErr.message);
    }

    // 3) Chama provedor
    await supabaseAdmin.from("chip_purchases").update({ status: "provisioning" }).eq("id", purchase.id);
    try {
      const provider = getChipProvider(item.provider);
      const result = await provider.buyNumber({ serviceCode: item.provider_service_code, country: item.country_code });
      const expiresAt = result.expiresAt ?? new Date(Date.now() + item.ttl_minutes * 60 * 1000).toISOString();
      await supabaseAdmin.from("chip_purchases").update({
        status: "active",
        provider_order_id: result.orderId,
        phone_number: result.phone,
        expires_at: expiresAt,
      }).eq("id", purchase.id);
      return { ok: true, purchase_id: purchase.id, phone: result.phone };
    } catch (e) {
      // Estorna saldo
      await supabaseAdmin.rpc("credit_wallet", {
        _user_id: userId,
        _amount_cents: item.price_cents,
        _type: "refund",
        _description: `Estorno: ${item.name}`,
        _stripe_pi: null,
        _chip_purchase_id: purchase.id,
      });
      await supabaseAdmin.from("chip_purchases").update({
        status: "refunded",
        error: (e as Error).message,
      }).eq("id", purchase.id);
      throw new Error(`Falha no provedor: ${(e as Error).message}. Saldo estornado.`);
    }
  });
