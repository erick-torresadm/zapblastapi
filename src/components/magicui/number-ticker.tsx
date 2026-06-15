import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

export function NumberTicker({
  value,
  className,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number;
  className?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  useEffect(() => {
    if (isInView) motionValue.set(value);
  }, [motionValue, isInView, value]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = prefix + Number(latest).toLocaleString("pt-BR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) + suffix;
      }
    });
  }, [springValue, decimals, prefix, suffix]);

  return <span ref={ref} className={cn("tabular-nums", className)}>{prefix}0{suffix}</span>;
}
