import { alongTrack, haversineNm, nearestProgress, type LatLon } from "./geo.ts";
import type { ParsedRoute } from "./gpx";
import type { RouteStation } from "./meteo";
import { formatDurationMin, formatEtaDay } from "./utils.ts";

export type Place = { name: string; lat: number; lon: number };

/** Coastal ports and cities the derrota is likely to pass. */
export const COAST_PLACES: Place[] = [
  { name: "Mucuripe", lat: -3.718, lon: -38.473 },
  { name: "Fortaleza", lat: -3.731, lon: -38.526 },
  { name: "Pecém", lat: -3.533, lon: -38.808 },
  { name: "São Gonçalo do Amarante", lat: -3.607, lon: -38.968 },
  { name: "Caucaia", lat: -3.736, lon: -38.661 },
  { name: "Aquiraz", lat: -3.901, lon: -38.391 },
  { name: "Paracuru", lat: -3.41, lon: -39.03 },
  { name: "Camocim", lat: -2.902, lon: -40.841 },
  { name: "Acaraú", lat: -2.888, lon: -40.12 },
  { name: "Itarema", lat: -2.925, lon: -39.916 },
  { name: "Aracati", lat: -4.561, lon: -37.77 },
  { name: "Areia Branca", lat: -4.956, lon: -36.943 },
  { name: "Natal", lat: -5.795, lon: -35.209 },
  { name: "Cabedelo", lat: -6.981, lon: -34.834 },
  { name: "Recife", lat: -8.053, lon: -34.881 },
  { name: "Suape", lat: -8.395, lon: -34.974 },
  { name: "Maceió", lat: -9.666, lon: -35.735 },
  { name: "Salvador", lat: -12.971, lon: -38.501 },
  { name: "Ilhéus", lat: -14.789, lon: -39.046 },
  { name: "Vitória", lat: -20.319, lon: -40.338 },
  { name: "Rio de Janeiro", lat: -22.897, lon: -43.18 },
  { name: "Santos", lat: -23.961, lon: -46.333 },
  { name: "Itajaí", lat: -26.908, lon: -48.661 },
  { name: "Rio Grande", lat: -32.081, lon: -52.167 },
  { name: "São Luís", lat: -2.53, lon: -44.303 },
  { name: "Itaqui", lat: -2.578, lon: -44.37 },
  { name: "Belém", lat: -1.456, lon: -48.504 },
  { name: "Vila do Conde", lat: -1.54, lon: -48.75 },
  { name: "Santarém", lat: -2.443, lon: -54.708 },
  { name: "Manaus", lat: -3.119, lon: -60.021 },
  { name: "Macapá", lat: 0.034, lon: -51.05 },
];

export type NearestPlace = { name: string; nm: number };

export function nearestPlace(
  lat: number,
  lon: number,
  maxNm = 18,
): NearestPlace | null {
  let best: NearestPlace | null = null;
  for (const p of COAST_PLACES) {
    const nm = haversineNm(lat, lon, p.lat, p.lon);
    if (nm > maxNm) continue;
    if (!best || nm < best.nm) best = { name: p.name, nm };
  }
  return best;
}

export function nearestPlaceAny(lat: number, lon: number): NearestPlace {
  let best: NearestPlace | null = null;
  for (const p of COAST_PLACES) {
    const nm = haversineNm(lat, lon, p.lat, p.lon);
    if (!best || nm < best.nm) best = { name: p.name, nm };
  }
  return best ?? { name: "costa", nm: 0 };
}

export function withCity(lat: number, lon: number, label: string) {
  const city = nearestPlace(lat, lon);
  if (!city) return label;
  if (label.toLowerCase().includes(city.name.toLowerCase())) return label;
  return `${label} · ${city.name}`;
}

export type CityPass = {
  nome: string;
  nm: number;
  faltaNm: number;
  offNm: number;
  passou: boolean;
  eta: string | null;
  falta: string | null;
};

export function cityPassages(
  points: LatLon[],
  alongNm: number,
  sogKn: number,
  nowMs = Date.now(),
  maxOffNm = 22,
): CityPass[] {
  if (points.length < 2) return [];
  const out: CityPass[] = [];
  for (const place of COAST_PLACES) {
    const along = nearestProgress(points, place.lat, place.lon);
    const p = alongTrack(points, along);
    if (!p) continue;
    const offNm = haversineNm(p.lat, p.lon, place.lat, place.lon);
    if (offNm > maxOffNm) continue;
    const faltaNm = along - alongNm;
    const passou = faltaNm < -0.6;
    const etaMin = sogKn > 0.4 && faltaNm > 0.15 ? (faltaNm / sogKn) * 60 : null;
    const etaMs = etaMin != null ? nowMs + etaMin * 60_000 : null;
    out.push({
      nome: place.name,
      nm: Number(along.toFixed(1)),
      faltaNm: Number(Math.max(0, faltaNm).toFixed(1)),
      offNm: Number(offNm.toFixed(1)),
      passou,
      eta: passou ? "já passou" : etaMs ? formatEtaDay(etaMs, nowMs) : null,
      falta: passou ? null : etaMin != null ? formatDurationMin(etaMin) : null,
    });
  }
  out.sort((a, b) => a.nm - b.nm);
  return out.slice(0, 12);
}

export type MapMark = {
  lat: number;
  lon: number;
  title: string;
  kind: "origin" | "dest" | "wpt" | "station";
};

export function routeMapMarks(
  route: ParsedRoute | null,
  stations: RouteStation[] = [],
): MapMark[] {
  const out: MapMark[] = [];
  const add = (lat: number, lon: number, title: string, kind: MapMark["kind"]) => {
    if (out.some((m) => haversineNm(m.lat, m.lon, lat, lon) < 0.55)) return;
    out.push({ lat, lon, title, kind });
  };
  const pts = route?.points ?? [];
  if (pts.length) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    add(a.lat, a.lon, withCity(a.lat, a.lon, a.name || "Origem"), "origin");
    for (const w of route?.waypoints ?? []) {
      add(w.lat, w.lon, withCity(w.lat, w.lon, w.name), "wpt");
    }
    add(b.lat, b.lon, withCity(b.lat, b.lon, b.name || "Destino"), "dest");
  }
  for (const s of stations) {
    add(s.lat, s.lon, withCity(s.lat, s.lon, s.label), "station");
  }
  return out;
}
