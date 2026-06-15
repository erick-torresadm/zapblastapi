// Normaliza para E.164 sem o "+" (formato esperado pelo Evolution: 5511987654321)
export function normalizePhone(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  // Se começa com "0" remove
  let n = digits.replace(/^0+/, "");
  // Se for brasileiro (10-11 dígitos) prefixa 55
  if (n.length === 10 || n.length === 11) n = "55" + n;
  if (n.length < 11 || n.length > 15) return null;
  return n;
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if ((c === "," || c === ";") && !inQ) {
        out.push(cur); cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
  return { headers, rows };
}
