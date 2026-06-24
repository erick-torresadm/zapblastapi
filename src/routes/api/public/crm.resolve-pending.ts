// Worker que tenta resolver conversas com @lid pendente.
// Chamado a cada 1 minuto via pg_cron. Para cada conversa pendente:
// 1) Busca perfil real na Evolution (fetchProfile + fetchProfilePictureUrl)
// 2) Se número foi resolvido, faz merge com conversa existente (se houver) ou atualiza
// 3) Baixa avatar e salva em crm-avatars/{owner}/{phone}.jpg
// 4) Em caso de falha: backoff exponencial (5min * 2^attempts, máx 24h, cap 10 tentativas)
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/crm/resolve-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchProfile, fetchProfilePictureUrl } = await import("@/lib/evolution.server");

        // pega até 25 conversas pendentes elegíveis para tentar
        const { data: pending, error } = await supabaseAdmin
          .from("crm_conversations")
          .select("id,owner_user_id,instance_id,contact_phone,contact_jid,resolve_attempts,contact_avatar_path")
          .eq("is_resolved", false)
          .lte("next_resolve_at", new Date().toISOString())
          .lt("resolve_attempts", 10)
          .order("next_resolve_at", { ascending: true })
          .limit(25);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let resolved = 0;
        let failed = 0;
        let merged = 0;

        for (const conv of pending ?? []) {
          try {
            if (!conv.instance_id) {
              await markFail(supabaseAdmin, conv.id, conv.resolve_attempts);
              failed++;
              continue;
            }

            // carrega instância + server
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("id,instance_name,status,user_id,evolution_servers(base_url,api_key)")
              .eq("id", conv.instance_id)
              .maybeSingle();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const i = inst as any;
            if (!i || i.status !== "connected" || !i.evolution_servers?.base_url) {
              await markFail(supabaseAdmin, conv.id, conv.resolve_attempts);
              failed++;
              continue;
            }

            const server = { base_url: i.evolution_servers.base_url, api_key: i.evolution_servers.api_key };
            const target = conv.contact_jid ?? conv.contact_phone;

            // 1) tenta perfil completo (retorna o número real)
            let resolvedPhone: string | null = null;
            let contactName: string | null = null;
            let about: string | null = null;
            try {
              const prof = await fetchProfile(server, i.instance_name, target);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const p = prof as any;
              // Evolution retorna wuid no formato "5511999...@s.whatsapp.net"
              const wuid: string | undefined = p?.wuid ?? p?.numberExists?.jid ?? p?.id;
              if (wuid) {
                const phone = wuid.split("@")[0].split(":")[0];
                if (/^\d{10,14}$/.test(phone)) resolvedPhone = phone;
              }
              contactName = p?.name ?? p?.pushName ?? p?.verifiedName ?? null;
              const aboutVal = p?.status?.status ?? p?.status ?? null;
              about = typeof aboutVal === "string" ? aboutVal : null;
            } catch (e) {
              console.warn("[crm-resolve] fetchProfile fail", conv.id, e instanceof Error ? e.message : e);
            }

            // 2) tenta foto de perfil — independente do perfil ter resolvido
            let avatarPath: string | null = conv.contact_avatar_path;
            try {
              const phoneForPic = resolvedPhone ?? conv.contact_phone;
              const pic = await fetchProfilePictureUrl(server, i.instance_name, phoneForPic);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const url = (pic as any)?.profilePictureUrl ?? (pic as any)?.value ?? null;
              if (url) {
                const downloaded = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (downloaded.ok) {
                  const buffer = await downloaded.arrayBuffer();
                  const path = `${conv.owner_user_id}/${phoneForPic}.jpg`;
                  await supabaseAdmin.storage.from("crm-avatars").upload(path, buffer, {
                    contentType: downloaded.headers.get("content-type") ?? "image/jpeg",
                    upsert: true,
                  });
                  avatarPath = path;
                }
              }
            } catch (e) {
              console.warn("[crm-resolve] avatar fail", conv.id, e instanceof Error ? e.message : e);
            }

            // 3) aplica resultado
            if (resolvedPhone && resolvedPhone !== conv.contact_phone) {
              // checa duplicata
              const { data: existing } = await supabaseAdmin
                .from("crm_conversations")
                .select("id")
                .eq("owner_user_id", conv.owner_user_id)
                .eq("contact_phone", resolvedPhone)
                .maybeSingle();

              if (existing) {
                // merge: move tudo da conv atual para a existente
                await supabaseAdmin.rpc("crm_merge_conversations", {
                  _src_id: conv.id, _dst_id: existing.id,
                });
                // atualiza a destino com dados novos
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const patch: any = { is_resolved: true, next_resolve_at: null, resolve_attempts: 0 };
                if (contactName) patch.contact_name = contactName;
                if (about) patch.contact_about = about;
                if (avatarPath) patch.contact_avatar_path = avatarPath;
                await supabaseAdmin.from("crm_conversations").update(patch).eq("id", existing.id);
                merged++;
              } else {
                // atualiza o phone (a unique key owner_user_id+contact_phone permite porque resolvedPhone é novo)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const patch: any = {
                  contact_phone: resolvedPhone,
                  is_resolved: true,
                  next_resolve_at: null,
                  resolve_attempts: 0,
                };
                if (contactName) patch.contact_name = contactName;
                if (about) patch.contact_about = about;
                if (avatarPath) patch.contact_avatar_path = avatarPath;
                await supabaseAdmin.from("crm_conversations").update(patch).eq("id", conv.id);

                // atualiza chat_messages também
                await supabaseAdmin
                  .from("chat_messages")
                  .update({ contact_phone: resolvedPhone })
                  .eq("user_id", conv.owner_user_id)
                  .eq("contact_phone", conv.contact_phone);
                resolved++;
              }
            } else if (avatarPath || contactName || about) {
              // não resolveu o número mas pegou alguma info — não marca resolved ainda
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const patch: any = {};
              if (contactName) patch.contact_name = contactName;
              if (about) patch.contact_about = about;
              if (avatarPath) patch.contact_avatar_path = avatarPath;
              await supabaseAdmin.from("crm_conversations").update(patch).eq("id", conv.id);
              await markFail(supabaseAdmin, conv.id, conv.resolve_attempts);
              failed++;
            } else {
              await markFail(supabaseAdmin, conv.id, conv.resolve_attempts);
              failed++;
            }
          } catch (e) {
            console.error("[crm-resolve] error", conv.id, e);
            await markFail(supabaseAdmin, conv.id, conv.resolve_attempts);
            failed++;
          }
        }

        return Response.json({
          ok: true,
          processed: pending?.length ?? 0,
          resolved, merged, failed,
        });
      },
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markFail(admin: any, convId: string, attempts: number) {
  const next = attempts + 1;
  // backoff: 5min * 2^attempts, cap em 24h
  const minutes = Math.min(5 * Math.pow(2, attempts), 24 * 60);
  const nextAt = new Date(Date.now() + minutes * 60_000).toISOString();
  await admin
    .from("crm_conversations")
    .update({ resolve_attempts: next, next_resolve_at: nextAt })
    .eq("id", convId);
}
