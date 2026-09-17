import { bearingDeg, destPoint, haversineNm, type LatLon } from "./geo";
import { parseGpx, type ParsedRoute } from "./gpx";

/** Mucuripe (Fortaleza) → aproximação de Pecém, ~2 nmi ao largo. */
const ANCHORS: Array<[number, number]> = [
  [-3.7184, -38.4732],
  [-3.7148, -38.4605],
  [-3.7082, -38.4488],
  [-3.6965, -38.4555],
  [-3.682, -38.478],
  [-3.666, -38.508],
  [-3.648, -38.542],
  [-3.628, -38.582],
  [-3.608, -38.628],
  [-3.588, -38.678],
  [-3.568, -38.728],
  [-3.552, -38.768],
  [-3.538, -38.798],
  [-3.5332, -38.8084],
];

function densify(anchors: Array<[number, number]>, stepNm = 0.32): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const [lat, lon] = anchors[i]!;
    if (i === 0) {
      out.push({ lat, lon });
      continue;
    }
    const prev = out[out.length - 1]!;
    const dist = haversineNm(prev.lat, prev.lon, lat, lon);
    const brg = bearingDeg(prev.lat, prev.lon, lat, lon);
    const n = Math.max(1, Math.round(dist / stepNm));
    for (let k = 1; k <= n; k++) {
      out.push(destPoint(prev.lat, prev.lon, brg, (dist * k) / n));
    }
  }
  return out;
}

export function sampleGpxXml() {
  const points = densify(ANCHORS);
  const body = points
    .map((p) => `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>0</ele></trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Proa" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Mucuripe → Pecém</name>
    <desc>Derrota de exemplo: Porto do Mucuripe (Fortaleza) à aproximação de Pecém.</desc>
  </metadata>
  <trk>
    <name>Mucuripe → Pecém</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>`;
}

export function loadSampleRoute(): ParsedRoute {
  return parseGpx(sampleGpxXml(), "mucuripe-pecem.gpx");
}
