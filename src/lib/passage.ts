import { alongTrack, crossTrackOf, nearestProgress, pathLengthNm, type XteFix } from "./geo";
import type { ParsedRoute } from "./gpx";
import type { EngineSnapshot } from "./sensor-engine";

export type Passage = {
  alongNm: number;
  remainNm: number;
  totalNm: number;
  progress: number;
  sogKn: number;
  gpsKn: number | null;
  trackKn: number | null;
  valid: boolean;
  etaMs: number | null;
  etaMin: number | null;
  xteNm: number;
  xteSide: XteFix["side"];
};

export function passageOf(
  route: ParsedRoute | null,
  engine: EngineSnapshot | null,
): Passage | null {
  if (!route || route.points.length < 2 || !engine?.fix) return null;
  const totalNm = pathLengthNm(route.points);
  const alongNm =
    engine.mode === "sim"
      ? engine.simNm
      : nearestProgress(route.points, engine.fix.lat, engine.fix.lon);
  const p = alongTrack(route.points, alongNm);
  const remainNm = p?.remainNm ?? Math.max(0, totalNm - alongNm);
  const sogKn = engine.fix.sogKn;
  const etaMin =
    sogKn > 0.4 && remainNm >= 0 ? (remainNm / sogKn) * 60 : null;
  const etaMs = etaMin != null ? Date.now() + etaMin * 60_000 : null;
  const xte =
    engine.mode === "sim"
      ? { nm: 0, side: "linha" as const, alongNm }
      : crossTrackOf(route.points, engine.fix.lat, engine.fix.lon);
  return {
    alongNm,
    remainNm,
    totalNm,
    progress: p?.progress ?? (totalNm > 0 ? alongNm / totalNm : 0),
    sogKn,
    gpsKn: engine.fix.gpsKn,
    trackKn: engine.fix.trackKn,
    valid: engine.fix.valid,
    etaMs,
    etaMin,
    xteNm: xte.nm,
    xteSide: xte.side,
  };
}

export function speedHint(p: Passage) {
  if (p.valid) return "validada";
  if (p.gpsKn != null && p.trackKn != null) {
    return `GPS ${p.gpsKn.toFixed(1)} · derrota ${p.trackKn.toFixed(1)}`;
  }
  if (p.trackKn != null) return `derrota ${p.trackKn.toFixed(1)} nós`;
  if (p.gpsKn != null) return `GPS ${p.gpsKn.toFixed(1)} nós`;
  return "sem confirmação";
}