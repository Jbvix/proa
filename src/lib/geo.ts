const EARTH_NM = 3440.065;
const DEG = Math.PI / 180;

export function toRad(d: number) {
  return d * DEG;
}

export function toDeg(r: number) {
  return r / DEG;
}

export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destPoint(
  lat: number,
  lon: number,
  bearing: number,
  distNm: number,
) {
  const δ = distNm / EARTH_NM;
  const θ = toRad(bearing);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
}

export function msToKn(ms: number) {
  return ms * 1.94384;
}

export function knToMs(kn: number) {
  return kn / 1.94384;
}

export type LatLon = { lat: number; lon: number };

export function pathLengthNm(points: LatLon[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    d += haversineNm(a.lat, a.lon, b.lat, b.lon);
  }
  return d;
}

export function alongTrack(
  points: LatLon[],
  distanceNm: number,
): { lat: number; lon: number; cog: number; remainNm: number; progress: number } | null {
  if (points.length < 2) return null;
  const total = pathLengthNm(points);
  if (total <= 0) {
    const p = points[0]!;
    return { lat: p.lat, lon: p.lon, cog: 0, remainNm: 0, progress: 1 };
  }
  let remain = Math.max(0, distanceNm);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (remain <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(1, remain / seg) : 1;
      const cog = bearingDeg(a.lat, a.lon, b.lat, b.lon);
      const travelled = Math.min(total, distanceNm);
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        cog,
        remainNm: Math.max(0, total - travelled),
        progress: travelled / total,
      };
    }
    remain -= seg;
  }
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  return {
    lat: last.lat,
    lon: last.lon,
    cog: bearingDeg(prev.lat, prev.lon, last.lat, last.lon),
    remainNm: 0,
    progress: 1,
  };
}

export function nearestProgress(points: LatLon[], lat: number, lon: number) {
  if (points.length < 2) return 0;
  let best = Infinity;
  let along = 0;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = haversineNm(a.lat, a.lon, b.lat, b.lon);
    const steps = Math.max(2, Math.ceil(seg * 20));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const pLat = a.lat + (b.lat - a.lat) * t;
      const pLon = a.lon + (b.lon - a.lon) * t;
      const d = haversineNm(lat, lon, pLat, pLon);
      if (d < best) {
        best = d;
        along = acc + seg * t;
      }
    }
    acc += seg;
  }
  return along;
}
