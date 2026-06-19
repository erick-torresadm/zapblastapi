import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlanLimitsFn, type PlanLimits } from "@/lib/billing.functions";

export function usePlanLimits() {
  const fn = useServerFn(getPlanLimitsFn);
  const q = useQuery({ queryKey: ["plan-limits"], queryFn: () => fn(), staleTime: 30_000 });
  const data = q.data;
  const lim = data?.limits;
  const use = data?.usage;
  const isUnlimited = (n?: number) => n === -1;

  const trialDaysLeft = (() => {
    if (!data?.trial_ends_at) return null;
    const ms = new Date(data.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
  })();

  return {
    data: data ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
    canAct: data?.can_act ?? false,
    isTrialing: data?.status === "trialing",
    isTrialExpired: data?.trial_expired ?? false,
    isPastDue: data?.status === "past_due",
    trialDaysLeft,
    canConnectChip:
      (data?.can_act ?? false) && lim && use ? isUnlimited(lim.max_chips) || use.chips < lim.max_chips : false,
    canCreateCampaign:
      (data?.can_act ?? false) && lim && use
        ? isUnlimited(lim.max_active_campaigns) || use.active_campaigns < lim.max_active_campaigns
        : false,
    warmupEnabled: lim ? lim.warmup_tier !== "off" : false,
    fmtLimit: (n?: number) => (n === -1 ? "Ilimitado" : (n ?? 0).toLocaleString("pt-BR")),
    plan: data?.plan_name ?? null,
  } satisfies {
    data: PlanLimits | null;
    isLoading: boolean;
    refetch: ReturnType<typeof useQuery>["refetch"];
    canAct: boolean;
    isTrialing: boolean;
    isTrialExpired: boolean;
    isPastDue: boolean;
    trialDaysLeft: number | null;
    canConnectChip: boolean;
    canCreateCampaign: boolean;
    warmupEnabled: boolean;
    fmtLimit: (n?: number) => string;
    plan: string | null;
  };
}
