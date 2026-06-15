import type { ChipProvider, ChipProviderId } from "./types";
import { mockProvider } from "./mock";
import { smsActivateProvider } from "./sms_activate";
import { fivesimProvider } from "./fivesim";

const REGISTRY: Record<ChipProviderId, ChipProvider> = {
  mock: mockProvider,
  sms_activate: smsActivateProvider,
  fivesim: fivesimProvider,
  smspool: mockProvider, // placeholder
};

export function getChipProvider(id: ChipProviderId): ChipProvider {
  return REGISTRY[id] ?? mockProvider;
}

export type { ChipProvider, ChipProviderId } from "./types";
