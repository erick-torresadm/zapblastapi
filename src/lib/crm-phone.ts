// Formatadores de telefone para o CRM.
// - cleanPhone: extrai só dígitos
// - formatPhone: aplica máscara BR/INT amigável
// - isResolved: true se o número parece um telefone real (10-14 dígitos)
//   (números 15+ dígitos geralmente são @lid criptografado do WhatsApp ainda não resolvido)

export function cleanPhone(p?: string | null): string {
  if (!p) return "";
  return p.replace(/\D/g, "");
}

export function isPhoneResolved(p?: string | null): boolean {
  if (!p) return false;
  const c = cleanPhone(p);
  return /^\d{10,14}$/.test(c);
}

export function formatPhone(p?: string | null): string {
  if (!p) return "(sem número)";
  const c = cleanPhone(p);

  // BR celular com DDI 55: +55 (DD) 9XXXX-XXXX
  let m = c.match(/^55(\d{2})(\d{5})(\d{4})$/);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  // BR fixo com DDI 55: +55 (DD) XXXX-XXXX
  m = c.match(/^55(\d{2})(\d{4})(\d{4})$/);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  // BR celular sem DDI: (DD) 9XXXX-XXXX
  m = c.match(/^(\d{2})(\d{5})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  // BR fixo sem DDI
  m = c.match(/^(\d{2})(\d{4})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  // Internacional genérico
  if (c.length >= 10 && c.length <= 14) return `+${c}`;
  // @lid ou similar — pedir sync ao usuário
  return "Aguardando sincronização…";
}

export function displayName(name?: string | null, phone?: string | null): string {
  if (name && name.trim()) return name.trim();
  return formatPhone(phone);
}
