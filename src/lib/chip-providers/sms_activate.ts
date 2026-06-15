// Stub do SMS-Activate. Implementar quando usuário fornecer API key (SMS_ACTIVATE_API_KEY).
import type { ChipProvider } from "./types";

export const smsActivateProvider: ChipProvider = {
  id: "sms_activate",
  async buyNumber() { throw new Error("SMS-Activate ainda não configurado. Adicione SMS_ACTIVATE_API_KEY."); },
  async checkStatus() { throw new Error("SMS-Activate não configurado"); },
  async cancelOrder() { /* noop */ },
};
