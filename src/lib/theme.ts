export type ThemeId = "night" | "day";

const THEME_COLOR: Record<ThemeId, string> = {
  night: "#08141c",
  day: "#dfe8ec",
};

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "day" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

export function toggleTheme(theme: ThemeId): ThemeId {
  return theme === "night" ? "day" : "night";
}
