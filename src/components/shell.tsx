import type { ReactNode } from "react";
import { Compass, Gauge, Map, Waves } from "lucide-react";
import { ProaMark } from "@/components/mark";
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
  onLive,
  modeLabel,
}: {
  children: ReactNode;
  capturing: boolean;
  onToggleCapture: () => void;
  onLive: () => void;
  modeLabel: string;
}) {
  const tab = useBridge((s) => s.tab);
  const setTab = useBridge((s) => s.setTab);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-md">
        <ProaMark className="size-6 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl italic leading-none text-fg">Proa</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
            {modeLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCapture}
          className={cn(
            "h-11 rounded-md px-3 text-xs font-medium uppercase tracking-[0.12em] transition-[background-color,color] duration-150",
            capturing ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted",
          )}
        >
          {capturing ? "Capturando" : "Iniciar"}
        </button>
        <button
          type="button"
          onClick={onLive}
          className="h-11 rounded-md px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-fg"
        >
          Live
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
