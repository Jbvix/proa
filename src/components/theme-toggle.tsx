import { Moon, Sun } from "lucide-react";
import { useSettings } from "@/lib/store";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const next = toggleTheme(theme);
  return (
    <button
      type="button"
      aria-label={next === "day" ? "Tela dia" : "Tela noite"}
      title={next === "day" ? "Tela dia" : "Tela noite"}
      onClick={() => setTheme(next)}
      className={cn(
        "flex size-11 items-center justify-center rounded-md text-muted transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-fg",
      )}
    >
      {theme === "night" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
