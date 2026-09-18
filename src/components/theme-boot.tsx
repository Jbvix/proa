import { useEffect } from "react";
import { useSettings } from "@/lib/store";
import { applyTheme } from "@/lib/theme";

export function ThemeBoot() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return null;
}
