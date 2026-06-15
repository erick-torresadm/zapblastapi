import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const toggleWarmupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string; enabled: boolean; intensity?: "leve" | "medio" | "forte" }) =>
    z.object({
      instance_id: z.string().uuid(),
      enabled: z.boolean(),
      intensity: z.enum(["leve", "medio", "forte"]).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { warmup_enabled: boolean; warmup_intensity?: "leve" | "medio" | "forte"; warmup_started_at?: string } = { warmup_enabled: data.enabled };
    if (data.intensity) patch.warmup_intensity = data.intensity;
    if (data.enabled) {
      const { data: cur } = await supabase.from("whatsapp_instances")
        .select("warmup_started_at").eq("id", data.instance_id).maybeSingle();
      if (!cur?.warmup_started_at) patch.warmup_started_at = new Date().toISOString();
    }
    const { error } = await supabase.from("whatsapp_instances").update(patch).eq("id", data.instance_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetWarmupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { instance_id: string }) => z.object({ instance_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("whatsapp_instances").update({
      warmup_started_at: new Date().toISOString(),
      warmup_sent_today: 0,
      warmup_received_today: 0,
      warmup_total_sent: 0,
      warmup_last_at: null,
      health_score: 50,
    }).eq("id", data.instance_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
