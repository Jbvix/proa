import { cn } from "@/lib/utils";

export type AlanaFace = "off" | "espera" | "ouvindo" | "processando" | "falando";

export const ALANA_FACE_LABEL: Record<AlanaFace, string> = {
  off: "desligada",
  espera: "à espera",
  ouvindo: "ouvindo",
  processando: "processando",
  falando: "falando",
};

export function AlanaMark({
  face,
  level = 0,
  className,
}: {
  face: AlanaFace;
  level?: number;
  className?: string;
}) {
  const live = Math.min(1, Math.max(0, level * 14));
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("alana-mark", `alana-mark-${face}`, className)}
      style={{ ["--alana-level" as string]: String(live) }}
    >
      <circle className="alana-core" cx="12" cy="12" r="2.15" fill="currentColor" />
      <g className="alana-waves">
        <path
          className="alana-arc alana-arc-in"
          d="M8.15 8.15a5.45 5.45 0 0 0 0 7.7"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          className="alana-arc alana-arc-out"
          d="M5.55 5.55a9.12 9.12 0 0 0 0 12.9"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          className="alana-arc alana-arc-in"
          d="M15.85 8.15a5.45 5.45 0 0 1 0 7.7"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          className="alana-arc alana-arc-out"
          d="M18.45 5.55a9.12 9.12 0 0 1 0 12.9"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
