// Avatar de contato. Tenta na ordem:
// 1) URL HTTPS do storage cacheada (signed_url)
// 2) URL legada vinda da Evolution (contact_avatar_url) — pode falhar com 403 quando expira
// 3) Fallback colorido com iniciais
// O server fn signMediaUrlsFn já assina paths do bucket crm-avatars.
import { useState } from "react";

type Props = {
  name?: string | null;
  phone?: string | null;
  url?: string | null;        // URL pronta (signed ou legacy)
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

function initials(name?: string | null, phone?: string | null) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return "??";
}

// Cor estável a partir de uma string (HSL hue 0-359)
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Avatar({ name, phone, url, size = "md", className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const cls = `${sizes[size]} shrink-0 rounded-full object-cover ${className}`;

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ?? phone ?? ""}
        className={cls}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  const seed = name ?? phone ?? "x";
  const hue = hueFromString(seed);
  const bg = `hsl(${hue} 65% 50%)`;
  const bg2 = `hsl(${(hue + 30) % 360} 70% 40%)`;

  return (
    <div
      className={`${sizes[size]} shrink-0 inline-flex items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ background: `linear-gradient(135deg, ${bg}, ${bg2})` }}
      aria-label={name ?? phone ?? "Contato"}
    >
      {initials(name, phone)}
    </div>
  );
}
