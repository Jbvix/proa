import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1 font-mono tabular">
        <span className="text-2xl leading-none text-fg">{value}</span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
