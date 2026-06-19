// Google Maps lead extractor — pay-per-search (R$ 5 por busca).
// Usa Places API (New) via gateway do Lovable Maps Platform connector.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TOOL_PRICES } from "./tools.functions";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.location",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

function mapsHeaders(): Record<string, string> {
  const lovKey = process.env.LOVABLE_API_KEY;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovKey || !apiKey) throw new Error("Conector Google Maps não configurado");
  return {
    Authorization: `Bearer ${lovKey}`,
    "X-Connection-Api-Key": apiKey,
    "Content-Type": "application/json",
    "X-Goog-FieldMask": FIELD_MASK,
  };
}

type Place = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
};

type Lead = {
  place_id: string;
  name: string;
  phone: string | null;
  phone_intl: string | null;
  address: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviews: number;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  has_whatsapp?: boolean | null;
};

function placeToLead(p: Place): Lead {
  const phoneDigits = p.internationalPhoneNumber
    ? p.internationalPhoneNumber.replace(/\D/g, "")
    : p.nationalPhoneNumber
      ? p.nationalPhoneNumber.replace(/\D/g, "")
      : null;
  return {
    place_id: p.id,
    name: p.displayName?.text ?? "(sem nome)",
    phone: phoneDigits,
    phone_intl: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    address: p.formattedAddress ?? null,
    website: p.websiteUri ?? null,
    category: p.primaryTypeDisplayName?.text ?? (p.types?.[0] ?? null),
    rating: typeof p.rating === "number" ? p.rating : null,
    reviews: p.userRatingCount ?? 0,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    maps_url: p.googleMapsUri ?? null,
  };
}

async function callSearchText(body: Record<string, unknown>): Promise<{ places: Place[]; nextPageToken?: string }> {
  const res = await fetch(`${GATEWAY}/places/v1/places:searchText`, {
    method: "POST",
    headers: mapsHeaders(),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { places?: Place[]; nextPageToken?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json?.error?.message ?? `Maps API ${res.status}`);
  return { places: json.places ?? [], nextPageToken: json.nextPageToken };
}

async function callSearchNearby(body: Record<string, unknown>): Promise<{ places: Place[] }> {
  const res = await fetch(`${GATEWAY}/places/v1/places:searchNearby`, {
    method: "POST",
    headers: mapsHeaders(),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { places?: Place[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json?.error?.message ?? `Maps API ${res.status}`);
  return { places: json.places ?? [] };
}

async function getBalance(userClient: any, userId: string): Promise<number> {
  const { data } = await userClient.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle();
  return Number(data?.balance_cents ?? 0);
}

export const searchMapsLeadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    mode: "text" | "nearby";
    query: string;
    city?: string;
    category?: string;
    lat?: number;
    lng?: number;
    radius_m?: number;
    only_with_phone?: boolean;
    whatsapp_check?: boolean;
    whatsapp_instance_id?: string | null;
  }) =>
    z.object({
      mode: z.enum(["text", "nearby"]),
      query: z.string().min(2).max(200),
      city: z.string().max(120).optional(),
      category: z.string().max(80).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      radius_m: z.number().int().min(500).max(50000).optional(),
      only_with_phone: z.boolean().optional(),
      whatsapp_check: z.boolean().optional(),
      whatsapp_instance_id: z.string().uuid().nullable().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Check + debit upfront
    const cost = TOOL_PRICES.maps_search_flat_cents;
    const balance = await getBalance(supabase, userId);
    if (balance < cost) {
      throw new Error(`Saldo insuficiente. Necessário ${(cost / 100).toFixed(2).replace(".", ",")} (R$). Disponível R$ ${(balance / 100).toFixed(2).replace(".", ",")}. Adicione saldo na Carteira.`);
    }
    const { error: debitErr } = await supabase.rpc("debit_wallet" as never, {
      _amount_cents: cost,
      _description: `Maps: ${data.query}${data.city ? ` em ${data.city}` : ""}`,
    } as never);
    if (debitErr) throw new Error(`Falha ao debitar saldo: ${debitErr.message}`);

    // Refund helper
    async function refund(reason: string) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("credit_wallet" as never, {
        _user_id: userId,
        _amount_cents: cost,
        _type: "refund",
        _description: `Reembolso Maps: ${reason}`,
      } as never);
    }

    // 2. Run Maps calls (paginate up to maps_search_max_leads)
    let places: Place[] = [];
    try {
      if (data.mode === "nearby" && data.lat != null && data.lng != null) {
        const body: Record<string, unknown> = {
          locationRestriction: {
            circle: {
              center: { latitude: data.lat, longitude: data.lng },
              radius: data.radius_m ?? 5000,
            },
          },
          maxResultCount: 20,
          languageCode: "pt-BR",
          regionCode: "BR",
        };
        if (data.category) {
          body.includedTypes = [data.category];
        }
        if (data.query) {
          // Nearby doesn't accept free text; fall back to text search when query is the primary intent
          const { places: p1 } = await callSearchText({
            textQuery: `${data.query}${data.city ? ` em ${data.city}` : ""}`,
            languageCode: "pt-BR",
            regionCode: "BR",
            locationBias: {
              circle: {
                center: { latitude: data.lat, longitude: data.lng },
                radius: data.radius_m ?? 5000,
              },
            },
            pageSize: 20,
          });
          places = p1;
        } else {
          const { places: p } = await callSearchNearby(body);
          places = p;
        }
      } else {
        const textQuery = `${data.query}${data.city ? ` em ${data.city}` : ""}`;
        let pageToken: string | undefined;
        for (let i = 0; i < 3; i++) {
          const body: Record<string, unknown> = {
            textQuery,
            languageCode: "pt-BR",
            regionCode: "BR",
            pageSize: 20,
          };
          if (pageToken) body.pageToken = pageToken;
          const { places: p, nextPageToken } = await callSearchText(body);
          places.push(...p);
          if (!nextPageToken || places.length >= TOOL_PRICES.maps_search_max_leads) break;
          pageToken = nextPageToken;
          await new Promise((r) => setTimeout(r, 1200)); // token rate-limit
        }
      }
    } catch (e) {
      await refund(`API falhou: ${(e as Error).message.slice(0, 60)}`);
      throw new Error(`Falha na busca: ${(e as Error).message}. Saldo reembolsado.`);
    }

    // 3. Shape leads, optionally filter "only_with_phone"
    let leads: Lead[] = places.slice(0, TOOL_PRICES.maps_search_max_leads).map(placeToLead);
    if (data.only_with_phone) {
      leads = leads.filter((l) => l.phone && l.phone.length >= 10);
    }

    // 4. If no leads at all → refund
    if (leads.length === 0) {
      await refund("nenhum lead retornado");
      return {
        leads: [],
        total: 0,
        cost_cents: 0,
        refunded: true,
        whatsapp_valid_count: 0,
      };
    }

    // 5. WhatsApp validation (optional, extra cost)
    let whatsappValid = 0;
    let extraCost = 0;
    if (data.whatsapp_check && data.whatsapp_instance_id) {
      const phones = leads.filter((l) => l.phone).map((l) => l.phone as string);
      if (phones.length > 0) {
        extraCost = phones.length * TOOL_PRICES.maps_whatsapp_check_per_lead_cents;
        const bal2 = await getBalance(supabase, userId);
        if (bal2 >= extraCost) {
          const { error: dErr } = await supabase.rpc("debit_wallet" as never, {
            _amount_cents: extraCost,
            _description: `Maps: validação WhatsApp de ${phones.length} lead(s)`,
          } as never);
          if (!dErr) {
            try {
              // Resolve server
              const { data: inst } = await supabase
                .from("whatsapp_instances")
                .select("*")
                .eq("id", data.whatsapp_instance_id)
                .eq("user_id", userId)
                .maybeSingle();
              if (inst) {
                const { data: own } = await supabase.from("evolution_servers").select("*").eq("id", inst.server_id).maybeSingle();
                let server = own;
                if (!server) {
                  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                  const { data: shared } = await supabaseAdmin
                    .from("evolution_servers")
                    .select("*")
                    .eq("id", inst.server_id)
                    .eq("is_shared", true)
                    .maybeSingle();
                  server = shared;
                }
                if (server) {
                  const { checkWhatsappNumbers } = await import("@/lib/evolution.server");
                  const validMap = new Map<string, boolean>();
                  for (let i = 0; i < phones.length; i += 50) {
                    const chunk = phones.slice(i, i + 50);
                    const result = await checkWhatsappNumbers(server, inst.instance_name, chunk);
                    for (const r of result) {
                      validMap.set(String(r.number).replace(/\D/g, ""), !!r.exists);
                    }
                  }
                  for (const l of leads) {
                    if (l.phone) {
                      const ok = validMap.get(l.phone);
                      l.has_whatsapp = ok ?? false;
                      if (ok) whatsappValid++;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[maps] whatsapp check failed", (e as Error).message);
            }
          }
        }
      }
    }

    // 6. Log search
    await supabase.from("maps_searches").insert({
      user_id: userId,
      query: data.query,
      mode: data.mode,
      category: data.category ?? null,
      city: data.city ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      radius_m: data.radius_m ?? null,
      only_with_phone: !!data.only_with_phone,
      whatsapp_check: !!data.whatsapp_check,
      leads_returned: leads.length,
      whatsapp_valid_count: whatsappValid,
      cost_cents: cost + extraCost,
      refunded: false,
      results: leads as unknown as object,
    });

    return {
      leads,
      total: leads.length,
      cost_cents: cost + extraCost,
      refunded: false,
      whatsapp_valid_count: whatsappValid,
    };
  });

export const recentMapsSearchesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("maps_searches")
      .select("id, query, city, leads_returned, cost_cents, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    return data ?? [];
  });
