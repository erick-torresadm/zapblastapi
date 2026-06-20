import { createFileRoute } from "@tanstack/react-router";
import { createGroup, fetchInviteCode, findGroupInfos, updateGroupPicture, updateGroupParticipant } from "@/lib/evolution.server";
import { resolveInstancePhone, normalizePhoneList } from "@/lib/group-launcher.functions";


/**
 * Background worker for Group Launcher.
 * - Processes up to N pending create-jobs (one per instance per tick to throttle WhatsApp).
 * - Refreshes member_count for active links and rotates when full.
 *
 * Called by pg_cron every minute. Auth: apikey header (Supabase publishable).
 */
export const Route = createFileRoute("/api/public/group-launcher/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const apikey = request.headers.get("apikey") ?? url.searchParams.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const out = { created: 0, monitored: 0, rotated: 0, errors: [] as string[] };

        // ── 1) CREATE JOBS ──
        const { data: jobs } = await supabaseAdmin
          .from("group_create_jobs")
          .select("id, campaign_id, owner_user_id, subject, description, image_url, participant_phone, attempts")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("next_attempt_at", { ascending: true })
          .limit(10);

        type GroupCreateJob = {
          id: string; campaign_id: string; owner_user_id: string; subject: string;
          description: string | null; image_url: string | null; participant_phone: string | null; attempts: number | null;
        };

        for (const job of ((jobs ?? []) as GroupCreateJob[])) {
          await supabaseAdmin.from("group_create_jobs").update({ status: "processing" }).eq("id", job.id);
          try {
            const { data: campaign } = await supabaseAdmin
              .from("group_campaigns")
              .select("instance_id, extra_participants, admin_participants")
              .eq("id", job.campaign_id)
              .maybeSingle();
            if (!campaign?.instance_id) throw new Error("Campanha sem instância");

            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name, server_id, phone_number")
              .eq("id", campaign.instance_id)
              .maybeSingle();
            if (!inst) throw new Error("Instância não encontrada");
            const { data: srv } = await supabaseAdmin
              .from("evolution_servers")
              .select("base_url, api_key")
              .eq("id", inst.server_id)
              .maybeSingle();
            if (!srv) throw new Error("Servidor Evolution não encontrado");
            const server = { base_url: srv.base_url, api_key: srv.api_key };
            // Initial participant: instance's own number, or fall back to first "convidado".
            let participantPhone = String(job.participant_phone ?? "").replace(/\D/g, "");
            if (participantPhone.length < 10) {
              participantPhone = (await resolveInstancePhone(supabaseAdmin, campaign.instance_id)) ?? "";
            }
            if (participantPhone.length < 10) {
              const extras = normalizePhoneList(campaign.extra_participants as string[] | null);
              if (extras.length > 0) participantPhone = extras[0];
            }
            if (!participantPhone || participantPhone.length < 10) {
              throw new Error("Sem participante inicial — adicione um número em Configurações → Convidados ou reconecte o chip");
            }


            const grp = await createGroup(server, inst.instance_name, {
              subject: job.subject,
              description: job.description ?? undefined,
              participants: [participantPhone],
            });
            const jid = String(grp.id ?? grp.groupJid ?? "");
            if (!jid) throw new Error("Evolution não retornou ID do grupo");

            // small delay before fetching invite to let WhatsApp settle
            await new Promise((r) => setTimeout(r, 800));
            const inv = await fetchInviteCode(server, inst.instance_name, jid);

            if (job.image_url) {
              try { await updateGroupPicture(server, inst.instance_name, jid, job.image_url); } catch { /* non-fatal */ }
            }

            // Invite extras + promote admins (best-effort, non-fatal)
            const extras = normalizePhoneList(campaign.extra_participants as string[] | null)
              .filter((p) => p !== participantPhone);
            const admins = normalizePhoneList(campaign.admin_participants as string[] | null)
              .filter((p) => p !== participantPhone);
            if (extras.length) {
              try {
                await updateGroupParticipant(server, inst.instance_name, jid, "add", extras);
              } catch (e) { out.errors.push(`add participants ${jid}: ${(e as Error).message}`); }
            }
            if (admins.length) {
              await new Promise((r) => setTimeout(r, 600));
              try {
                await updateGroupParticipant(server, inst.instance_name, jid, "promote", admins);
              } catch (e) { out.errors.push(`promote admins ${jid}: ${(e as Error).message}`); }
            }

            // figure out next position
            const { data: maxRow } = await supabaseAdmin
              .from("group_campaign_links")
              .select("position")
              .eq("campaign_id", job.campaign_id)
              .order("position", { ascending: false })
              .limit(1)
              .maybeSingle();
            const pos = (maxRow?.position ?? 0) + 1;

            const { data: linkRow } = await supabaseAdmin
              .from("group_campaign_links")
              .insert({
                campaign_id: job.campaign_id,
                source: "created",
                group_jid: jid,
                invite_code: inv.inviteCode,
                invite_url: inv.inviteUrl,
                title: job.subject,
                position: pos,
                member_count: 1,
                status: "active",
                last_checked_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            await supabaseAdmin
              .from("group_create_jobs")
              .update({ status: "done", link_id: linkRow?.id ?? null, last_error: null })
              .eq("id", job.id);
            out.created++;
          } catch (e) {
            const msg = (e as Error).message;
            const attempts = (job.attempts ?? 0) + 1;
            const backoffMs = Math.min(60_000 * Math.pow(2, attempts), 60 * 60_000);
            await supabaseAdmin
              .from("group_create_jobs")
              .update({
                status: attempts >= 6 ? "failed" : "pending",
                attempts,
                last_error: msg,
                next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
              })
              .eq("id", job.id);
            out.errors.push(`job ${job.id}: ${msg}`);
          }
        }

        // ── 2) MONITOR ACTIVE LINKS ──
        const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
        const { data: links } = await supabaseAdmin
          .from("group_campaign_links")
          .select("id, campaign_id, group_jid")
          .eq("status", "active")
          .not("group_jid", "is", null)
          .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
          .limit(20);

        for (const link of links ?? []) {
          try {
            const { data: campaign } = await supabaseAdmin
              .from("group_campaigns")
              .select("instance_id, member_limit")
              .eq("id", link.campaign_id)
              .maybeSingle();
            if (!campaign?.instance_id) continue;
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("instance_name, server_id")
              .eq("id", campaign.instance_id)
              .maybeSingle();
            if (!inst) continue;
            const { data: srv } = await supabaseAdmin
              .from("evolution_servers")
              .select("base_url, api_key")
              .eq("id", inst.server_id)
              .maybeSingle();
            if (!srv) continue;

            const info = await findGroupInfos(
              { base_url: srv.base_url, api_key: srv.api_key },
              inst.instance_name,
              link.group_jid!,
            );
            const count = info.size ?? info.participants?.length ?? 0;
            const patch: { member_count: number; last_checked_at: string; status?: string; filled_at?: string } = {
              member_count: count,
              last_checked_at: new Date().toISOString(),
            };
            if (count >= campaign.member_limit) {
              patch.status = "full";
              patch.filled_at = new Date().toISOString();
              out.rotated++;
            }
            await supabaseAdmin.from("group_campaign_links").update(patch).eq("id", link.id);
            out.monitored++;
          } catch (e) {
            out.errors.push(`link ${link.id}: ${(e as Error).message}`);
          }
        }

        return Response.json(out);
      },
    },
  },
});
