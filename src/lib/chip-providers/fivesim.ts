// Stub do 5sim. Implementar quando usuário fornecer FIVESIM_API_KEY.
import type { ChipProvider } from "./types";

export const fivesimProvider: ChipProvider = {
  id: "fivesim",
  async buyNumber() { throw new Error("5sim ainda não configurado. Adicione FIVESIM_API_KEY."); },
  async checkStatus() { throw new Error("5sim não configurado"); },
  async cancelOrder() { /* noop */ },
};
