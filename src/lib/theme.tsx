import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";
type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };

const ThemeContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "perseidas-theme";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
  root.style.colorScheme = t;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe default: dark
  const [theme, setThemeState] = useState<Theme>("dark");

  // Hydrate from localStorage after mount (pre-hydration script already painted the class)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark") setThemeState(stored);
    } catch {}
  }, []);

  // Reapply on change
  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Inline script to set the theme class BEFORE hydration, so there's no flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'dark';var r=document.documentElement;r.classList.add(t);r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
