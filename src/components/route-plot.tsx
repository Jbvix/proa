import type { ParsedRoute } from "@/lib/gpx";
import type { RouteStation } from "@/lib/meteo";
import { cn } from "@/lib/utils";

type Props = {
  route: ParsedRoute | null;
  lat?: number | null;
  lon?: number | null;
  cog?: number | null;
  stations?: RouteStation[];
  className?: string;
};

export function RoutePlot({ route, lat, lon, cog, stations, className }: Props) {
  const pts = route?.points ?? [];
  if (pts.length < 2) {
    return (
      <div
        className={cn(
          "flex h-56 items-center justify-center rounded-lg bg-bg px-6 text-center text-sm text-muted",
          className,
        )}
      >
        Importe um GPX para ver a derrota.
      </div>
    );
  }

  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180) || 1;
  const xs = pts.map((p) => p.lon * cos);
  const ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 0.08;
  const spanX = Math.max(maxX - minX, 0.002);
  const spanY = Math.max(maxY - minY, 0.002);
  const vb = 100;

  const sx = (x: number) => ((x - minX) / spanX) * (vb * (1 - pad * 2)) + vb * pad;
  const sy = (y: number) =>
    vb - (((y - minY) / spanY) * (vb * (1 - pad * 2)) + vb * pad);

  const d = pts
    .map((p, i) => {
      const x = sx(p.lon * cos);
      const y = sy(p.lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const hasFix = lat != null && lon != null;
  const fx = hasFix ? sx(lon! * cos) : 0;
  const fy = hasFix ? sy(lat!) : 0;
  const rot = cog ?? 0;

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      className={cn("h-56 w-full rounded-lg bg-bg", className)}
      role="img"
      aria-label="Derrota"
    >
      <rect width={vb} height={vb} fill="#071018" />
      {[0.25, 0.5, 0.75].map((g) => (
        <g key={g} stroke="rgba(232,238,242,0.08)">
          <line x1={0} x2={vb} y1={vb * g} y2={vb * g} />
          <line y1={0} y2={vb} x1={vb * g} x2={vb * g} />
        </g>
      ))}
      <path
        d={d}
        fill="none"
        stroke="#5d8f9c"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke="#b7d4dc"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {(stations ?? []).map((s, i) => (
        <g key={`${s.lat}-${s.lon}-${i}`}>
          <circle cx={sx(s.lon * cos)} cy={sy(s.lat)} r="1.6" fill="#c4a574" />
        </g>
      ))}
      <circle cx={sx(pts[0]!.lon * cos)} cy={sy(pts[0]!.lat)} r="2" fill="#e8eef2" />
      <circle
        cx={sx(pts[pts.length - 1]!.lon * cos)}
        cy={sy(pts[pts.length - 1]!.lat)}
        r="2"
        fill="#7aa3b0"
      />
      {hasFix ? (
        <g transform={`translate(${fx} ${fy}) rotate(${rot})`}>
          <polygon points="0,-3.2 2.2,3.4 0,2.1 -2.2,3.4" fill="#e8eef2" />
        </g>
      ) : null}
    </svg>
  );
}
