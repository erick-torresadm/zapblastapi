// Formatação de identificação de chips (instâncias WhatsApp).
// Mostra o telefone ao lado do nome do chip para facilitar identificação.

export function formatPhone(raw?: string | null): string {
  if (!raw) return "sem número";
  // remove tudo que não é dígito (lida com JIDs tipo "5511999999999@s.whatsapp.net")
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return "sem número";

  // Brasil (55) com 12 ou 13 dígitos: +55 (DD) 9XXXX-XXXX
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const mid = rest.slice(0, rest.length - 4);
    const end = rest.slice(-4);
    return `+55 (${ddd}) ${mid}-${end}`;
  }

  // fallback: agrupa internacional simples
  if (digits.length > 10) {
    return `+${digits.slice(0, digits.length - 10)} ${digits.slice(-10, -8)} ${digits.slice(-8, -4)}-${digits.slice(-4)}`;
  }
  return `+${digits}`;
}

export function formatInstanceLabel(
  name?: string | null,
  phone?: string | null,
): string {
  const n = (name ?? "").trim() || "chip";
  return `${n} · ${formatPhone(phone)}`;
}
