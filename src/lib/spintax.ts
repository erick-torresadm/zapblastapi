// Spintax: {Oi|Olá|E aí} {{nome}} → "Olá João"
export function renderSpintax(template: string, variables: Record<string, string> = {}): string {
  // Resolve {opt1|opt2|opt3} recursively
  let out = template;
  const re = /\{([^{}]+)\}/;
  let safety = 0;
  while (re.test(out) && safety++ < 200) {
    out = out.replace(re, (_m, inner: string) => {
      const opts = inner.split("|");
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }
  // Variables: {{name}}
  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    return variables[key] ?? "";
  });
  return out.trim();
}

export function previewSpintax(template: string, sampleVars: Record<string, string>, count = 5): string[] {
  return Array.from({ length: count }, () => renderSpintax(template, sampleVars));
}
