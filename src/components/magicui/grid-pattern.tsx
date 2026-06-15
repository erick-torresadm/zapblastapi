import { useId } from "react";
import { cn } from "@/lib/utils";

export function GridPattern({
  width = 40,
  height = 40,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-white/[0.02] stroke-white/[0.06]",
        className,
      )}
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
