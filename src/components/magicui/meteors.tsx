import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Meteors({ number = 20, className }: { number?: number; className?: string }) {
  const [styles, setStyles] = useState<Array<React.CSSProperties>>([]);
  useEffect(() => {
    setStyles(
      Array.from({ length: number }, () => ({
        "--angle": "-45deg",
        top: -5,
        left: `calc(0% + ${Math.floor(Math.random() * 100)}%)`,
        animationDelay: Math.random() * 1 + "s",
        animationDuration: Math.floor(Math.random() * 8 + 4) + "s",
      })) as React.CSSProperties[],
    );
  }, [number]);
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {styles.map((style, idx) => (
        <span
          key={idx}
          style={style}
          className="absolute h-0.5 w-0.5 rotate-[var(--angle)] animate-meteor rounded-full bg-indigo-300 shadow-[0_0_0_1px_#ffffff10] before:absolute before:top-1/2 before:h-px before:w-[50px] before:-translate-y-1/2 before:bg-gradient-to-r before:from-indigo-300 before:to-transparent before:content-['']"
        />
      ))}
    </div>
  );
}
