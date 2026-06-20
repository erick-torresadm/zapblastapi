// Chip de data sticky entre grupos de mensagens.
export function DateSeparator({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const md = new Date(d); md.setHours(0,0,0,0);
  const diff = (today.getTime() - md.getTime()) / 86400000;
  let label: string;
  if (diff === 0) label = "Hoje";
  else if (diff === 1) label = "Ontem";
  else if (diff < 7) label = d.toLocaleDateString("pt-BR", { weekday: "long" });
  else label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="sticky top-2 z-10 my-3 flex justify-center">
      <span className="rounded-full bg-card/90 backdrop-blur px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm border">
        {label}
      </span>
    </div>
  );
}
