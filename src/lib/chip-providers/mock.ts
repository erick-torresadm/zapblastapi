// Provedor MOCK pra desenvolvimento. Retorna número fake brasileiro.
import type { ChipProvider } from "./types";

function fakeBrPhone(): string {
  const ddd = 11 + Math.floor(Math.random() * 88);
  const n = Math.floor(900000000 + Math.random() * 99999999);
  return `+55${ddd}${n}`;
}

export const mockProvider: ChipProvider = {
  id: "mock",
  async buyNumber() {
    return {
      orderId: "mock_" + Math.random().toString(36).slice(2, 10),
      phone: fakeBrPhone(),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    };
  },
  async checkStatus(orderId) {
    return { phone: fakeBrPhone(), status: "waiting", smsCode: undefined };
  },
  async cancelOrder() { /* noop */ },
};
