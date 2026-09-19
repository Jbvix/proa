import { nearestProgress } from "./geo.ts";
import type { ParsedRoute } from "./gpx.ts";

export type WpMark = { nome: string; nm: number };

export type PassState = {
  primed: boolean;
  lastAlong: number;
  done: Record<string, true>;
};

export const PASS_IDLE: PassState = { primed: false, lastAlong: 0, done: {} };

export function wpKey(m: WpMark) {
  return `${m.nm.toFixed(1)}:${m.nome}`;
}

/** GPX waypoints on the track, nearest-progress nm, de-duped. */
export function waypointMarks(route: ParsedRoute | null): WpMark[] {
  if (!route || route.points.length < 2) return [];
  const pts = route.points;
  const out: WpMark[] = [];
  for (const w of route.waypoints) {
    const nm = nearestProgress(pts, w.lat, w.lon);
    if (!Number.isFinite(nm)) continue;
    if (out.some((x) => Math.abs(x.nm - nm) < 0.35)) continue;
    out.push({ nome: w.name || `WP ${out.length + 1}`, nm: Number(nm.toFixed(2)) });
  }
  out.sort((a, b) => a.nm - b.nm);
  return out;
}

export function tickWaypointPass(
  prev: PassState,
  input: {
    alongNm: number;
    sogKn: number;
    capturing: boolean;
    marks: WpMark[];
  },
): { state: PassState; passed: WpMark | null } {
  const { alongNm, sogKn, capturing, marks } = input;
  if (!capturing || sogKn < 0.6 || marks.length === 0) {
    return { state: prev, passed: null };
  }

  if (!prev.primed) {
    const done: Record<string, true> = { ...prev.done };
    for (const m of marks) {
      if (alongNm >= m.nm - 0.12) done[wpKey(m)] = true;
    }
    return { state: { primed: true, lastAlong: alongNm, done }, passed: null };
  }

  const done: Record<string, true> = { ...prev.done };
  let passed: WpMark | null = null;
  for (const m of marks) {
    const k = wpKey(m);
    if (done[k]) continue;
    if (m.nm < 0.25) {
      done[k] = true;
      continue;
    }
    const gate = m.nm - 0.1;
    if (prev.lastAlong < gate && alongNm >= gate) {
      done[k] = true;
      passed = m;
    }
  }
  return { state: { primed: true, lastAlong: alongNm, done }, passed };
}

export type ReportLive = {
  name?: string;
  sogKn: number | null;
  hsM: number | null;
  estado?: string | null;
  ondasMin?: number | null;
  ventoKn: number | null;
  ventoCard?: string | null;
  remainNm: number | null;
  eta?: string | null;
  nextNome?: string | null;
  nextFaltaNm?: number | null;
  mare?: string | null;
  xteNm?: number | null;
  xteLado?: string | null;
};

function n1(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(v >= 10 ? 0 : 1);
}

/** Short voyage report at a waypoint. No "Alana", no hold phrase. */
export function waypointReport(passed: WpMark, live: ReportLive, lastNm = Infinity) {
  const hi = live.name ? `${live.name}. ` : "";
  const arriving = passed.nm >= lastNm - 0.4 || (live.remainNm != null && live.remainNm < 0.8);
  const head = arriving ? `Chegando em ${passed.nome}.` : `Passando ${passed.nome}.`;
  const sog = n1(live.sogKn);
  const hs = live.hsM != null && Number.isFinite(live.hsM) ? live.hsM.toFixed(1) : null;
  const mar = [sog ? `${sog} nós` : null, hs ? `Hs ${hs} m` : null, live.estado, live.ondasMin != null ? `${live.ondasMin.toFixed(0)} por minuto` : null]
    .filter(Boolean)
    .join(", ");
  const vento = n1(live.ventoKn);
  const wind = vento ? `Vento ${vento} nós${live.ventoCard ? ` ${live.ventoCard}` : ""}.` : "";
  const falta = n1(live.remainNm);
  const eta = live.eta ? ` ETA ${live.eta}.` : "";
  const trip = falta ? `Faltam ${falta} milhas.${eta}` : eta.trim();
  const nextF = n1(live.nextFaltaNm);
  const next =
    !arriving && live.nextNome
      ? `Próximo: ${live.nextNome}${nextF ? `, ${nextF} milhas` : ""}.`
      : "";
  const mare = live.mare ? `Maré ${live.mare}.` : "";
  const xte =
    live.xteNm != null && live.xteNm >= 0.08
      ? `XTE ${live.xteNm.toFixed(2)} milhas ${live.xteLado ?? ""}`.trim() + "."
      : "";
  return [hi + "Olha só. " + head, mar ? `${mar}.` : "", wind, trip, next, mare, xte]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
