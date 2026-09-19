import type { ReactNode } from "react";
import { Compass, Gauge, Map, Waves } from "lucide-react";
import { ProaMark } from "@/components/mark";
import { DeckTools } from "@/components/deck-tools";
import { cn } from "@/lib/utils";
import { useBridge, type TabId } from "@/lib/store";

const TABS: { id: TabId; label: string; icon: typeof Compass }[] = [
  { id: "painel", label: "Painel", icon: Compass },
  { id: "ondas", label: "Ondas", icon: Waves },
  { id: "rota", label: "Rota", icon: Map },
  { id: "rpm", label: "RPM", icon: Gauge },
];

export function Shell({
  children,
  capturing,
  onToggleCapture,
  modeLabel,
}: {
  children: ReactNode;
  capturing: boolean;
  onToggleCapture: () => void;
  modeLabel: string;
}) {
  const tab = useBridge((s) => s.tab);
  const setTab = useBridge((s) => s.setTab);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden">
      <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg/90 px-2 backdrop-blur-md sm:h-16 sm:px-4">
        <ProaMark className="size-6 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl italic leading-none text-fg">Proa</p>
          <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-subtle">
            {modeLabel}
          </p>
        </div>
        <DeckTools />
        <button
          type="button"
          onClick={onToggleCapture}
          className={cn(
            "h-11 shrink-0 rounded-md px-3 text-xs font-medium uppercase tracking-[0.12em] transition-[background-color,color] duration-150",
            capturing ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted",
          )}
        >
          {capturing ? "Ao vivo" : "Iniciar"}
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
        {children}
      </main>

      <nav className="z-20 shrink-0 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-4">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] uppercase tracking-[0.12em] transition-[color] duration-150",
                    active ? "text-fg" : "text-subtle",
                  )}
                >
                  <Icon className={cn("size-5", active ? "text-accent" : "")} />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
