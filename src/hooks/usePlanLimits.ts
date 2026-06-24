import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlanLimitsFn, type PlanLimits } from "@/lib/billing.functions";

type LimitKey =
  | "max_chips"
  | "max_messages_per_day"
  | "max_active_campaigns"
  | "max_contacts_per_list"
  | "max_crm_agents"
  | "max_contact_lists"
  | "max_flows"
  | "max_traffic_funnels"
  | "max_agenda_businesses"
  | "max_group_campaigns";

type UsageKey =
  | "chips"
  | "active_campaigns"
  | "contact_lists"
  | "flows"
  | "traffic_funnels"
  | "agenda_businesses"
  | "group_campaigns"
  | "crm_agents"
  | "messages_today";

export function usePlanLimits() {
  const fn = useServerFn(getPlanLimitsFn);
  const q = useQuery({ queryKey: ["plan-limits"], queryFn: () => fn(), staleTime: 30_000 });
  const data = q.data as (PlanLimits & {
    feature_flags?: Record<string, boolean>;
    limits?: PlanLimits["limits"] & {
      max_contact_lists?: number;
      max_flows?: number;
      max_traffic_funnels?: number;
      max_agenda_businesses?: number;
      max_group_campaigns?: number;
      monthly_free_maps_searches?: number;
    };
    usage?: PlanLimits["usage"] & {
      contact_lists?: number;
      flows?: number;
      traffic_funnels?: number;
      agenda_businesses?: number;
      group_campaigns?: number;
      crm_agents?: number;
    };
  }) | undefined;
  const lim = data?.limits;
  const use = data?.usage;
  const flags = (data?.feature_flags ?? {}) as Record<string, boolean>;

  const isUnlimited = (n?: number) => n === -1;
  const within = (limitKey: LimitKey, usageKey: UsageKey) => {
    const l = (lim as Record<string, number> | undefined)?.[limitKey];
    const u = (use as Record<string, number> | undefined)?.[usageKey] ?? 0;
    if (l === undefined) return false;
    return isUnlimited(l) || u < l;
  };

  const canUseFeature = (key: string) => {
    if (flags[key] === false) return false;
    return true;
  };

  const trialDaysLeft = (() => {
    if (!data?.trial_ends_at) return null;
    const ms = new Date(data.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
  })();

  const canAct = data?.can_act ?? false;

  return {
    data: data ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
    canAct,
    isTrialing: data?.status === "trialing",
    isTrialExpired: data?.trial_expired ?? false,
    isPastDue: data?.status === "past_due",
    trialDaysLeft,
    canConnectChip: canAct && canUseFeature("campaigns") && within("max_chips", "chips"),
    canCreateCampaign: canAct && canUseFeature("campaigns") && within("max_active_campaigns", "active_campaigns"),
    canCreateList: canAct && within("max_contact_lists", "contact_lists"),
    canCreateFlow: canAct && canUseFeature("flows") && within("max_flows", "flows"),
    canCreateFunnel: canAct && canUseFeature("traffic_funnels") && within("max_traffic_funnels", "traffic_funnels"),
    canCreateAgenda: canAct && canUseFeature("agenda") && within("max_agenda_businesses", "agenda_businesses"),
    canCreateGroupCampaign:
      canAct && canUseFeature("group_campaigns") && within("max_group_campaigns", "group_campaigns"),
    canInviteAgent: canAct && canUseFeature("crm") && within("max_crm_agents", "crm_agents"),
    warmupEnabled: canUseFeature("warmup") && (lim?.warmup_tier ?? "off") !== "off",
    canUseFeature,
    featureFlags: flags,
    limitOf: (key: LimitKey) => (lim as Record<string, number> | undefined)?.[key] ?? 0,
    usageOf: (key: UsageKey) => (use as Record<string, number> | undefined)?.[key] ?? 0,
    fmtLimit: (n?: number) => (n === -1 ? "Ilimitado" : (n ?? 0).toLocaleString("pt-BR")),
    plan: data?.plan_name ?? null,
  };
}
