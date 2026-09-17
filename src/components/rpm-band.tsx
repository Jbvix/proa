import type { RpmAdvice } from "@/lib/rpm";
import { cn } from "@/lib/utils";

export function RpmBand({
  rpm,
  advice,
  max,
}: {
  rpm: number;
  advice: RpmAdvice;
  max: number;
}) {
  const pct = (n: number) => `${(n / max) * 100}%`;
  const tone =
    advice.label === "ideal"
      ? "text-ok"
      : advice.label === "acima"
        ? "text-danger"
        : "text-warn";

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            RPM atual
          </p>
          <p className={cn("font-mono text-4xl leading-none tabular", tone)}>{rpm}</p>
        </div>
        <p className="pb-1 text-right font-mono text-sm text-muted tabular">
          {advice.min}–{advice.max}
          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em]">
            faixa ideal
          </span>
        </p>
      </div>
      <div className="relative h-3 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 rounded-full bg-ok/35"
          style={{ left: pct(advice.min), width: pct(advice.max - advice.min) }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
          style={{ left: pct(Math.min(max, Math.max(0, rpm))) }}
        />
      </div>
      <p className="text-sm text-muted">{advice.reason}</p>
    </div>
  );
}
