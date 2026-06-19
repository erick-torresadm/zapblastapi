// Cria cobrança PIX imediata para plano anual
// Body: { plan_id: uuid }
// Retorna: { txid, qrcode (br code copia-cola), imagem_qrcode (data:image/png base64), valor, expires_in }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiPixFetch } from "../_shared/efi.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomTxid() {
  // 26-35 chars, [a-zA-Z0-9]
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("Unauthorized", { status: 401, headers: cors });
    const { data: userData } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!userData.user) return new Response("Unauthorized", { status: 401, headers: cors });
    const userId = userData.user.id;

    const { plan_id } = await req.json();
    if (!plan_id) return new Response(JSON.stringify({ error: "plan_id obrigatório" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: plan, error } = await supabase.from("subscription_plans").select("*").eq("id", plan_id).single();
    if (error || !plan) throw new Error("Plano não encontrado");

    const pixKey = Deno.env.get("EFI_PIX_KEY");
    if (!pixKey) throw new Error("EFI_PIX_KEY não configurada");

    const annualCents: number = plan.price_annual_cents ?? Math.round(plan.price_cents * 12 * 0.7);
    const valor = (annualCents / 100).toFixed(2);

    const txid = randomTxid();
    const cobRes = await efiPixFetch(`/v2/cob/${txid}`, {
      method: "PUT",
      body: JSON.stringify({
        calendario: { expiracao: 3600 },
        valor: { original: valor },
        chave: pixKey,
        solicitacaoPagador: `Plano ${plan.name} Anual`,
        infoAdicionais: [
          { nome: "user_id", valor: userId },
          { nome: "plan_id", valor: plan_id },
          { nome: "cycle", valor: "annual" },
        ],
      }),
    });
    if (!cobRes.ok) {
      const txt = await cobRes.text();
      return new Response(JSON.stringify({ error: "Falha ao criar cobrança PIX", details: txt }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const cob = await cobRes.json();
    const locId: number | undefined = cob?.loc?.id;
    if (!locId) throw new Error("Cobrança sem location id");

    const qrRes = await efiPixFetch(`/v2/loc/${locId}/qrcode`);
    if (!qrRes.ok) throw new Error(`QR code falhou: ${await qrRes.text()}`);
    const qr = await qrRes.json();

    // TODO: persistir txid em tabela própria de cobranças PIX para reconciliar via webhook


    return new Response(
      JSON.stringify({
        txid,
        qrcode: qr.qrcode,
        imagem_qrcode: qr.imagemQrcode,
        valor,
        expires_in: 3600,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const stack = (e as Error)?.stack ?? "";
    console.error("efi-pix-annual FATAL:", msg, stack);
    return new Response(JSON.stringify({ error: msg, stack }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
