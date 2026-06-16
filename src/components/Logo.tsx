import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/mirazap-logo.png";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  subtitle?: string;
  to?: string;
  className?: string;
  titleClassName?: string;
};

const sizes = {
  sm: { mark: "h-8 w-8", title: "text-base" },
  md: { mark: "h-9 w-9", title: "text-lg" },
  lg: { mark: "h-10 w-10", title: "text-xl" },
};

export function Logo({
  size = "md",
  showSubtitle = false,
  subtitle = "Anti-ban Suite",
  to,
  className,
  titleClassName,
}: LogoProps) {
  const s = sizes[size];
  const content = (
    <>
      <img
        src={logoMark}
        alt="Mirazap"
        width={40}
        height={40}
        className={cn("shrink-0 object-contain drop-shadow-[0_0_12px_rgba(34,197,94,0.35)]", s.mark)}
      />
      <div className="flex flex-col leading-tight">
        <span className={cn("font-display font-bold tracking-tight", s.title, titleClassName)}>
          Mirazap
        </span>
        {showSubtitle && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn("flex items-center gap-2.5", className)}>
        {content}
      </Link>
    );
  }
  return <div className={cn("flex items-center gap-2.5", className)}>{content}</div>;
}
