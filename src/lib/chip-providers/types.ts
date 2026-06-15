// Interface comum pra qualquer provedor de número virtual.
export type ChipProviderId = "mock" | "sms_activate" | "fivesim" | "smspool";

export interface BuyResult {
  orderId: string;
  phone: string; // E.164
  expiresAt?: string;
}

export interface StatusResult {
  phone: string;
  status: "waiting" | "received" | "canceled" | "expired";
  smsCode?: string;
}

export interface ChipProvider {
  id: ChipProviderId;
  buyNumber(opts: { serviceCode: string; country: string }): Promise<BuyResult>;
  checkStatus(orderId: string): Promise<StatusResult>;
  cancelOrder(orderId: string): Promise<void>;
}
