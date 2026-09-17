import { pathLengthNm, type LatLon } from "./geo";

export type RoutePoint = LatLon & { ele?: number; time?: string };

export type ParsedRoute = {
  name: string;
  points: RoutePoint[];
  distanceNm: number;
  source: string;
};

function attr(el: Element, name: string) {
  return el.getAttribute(name);
}

function collectPts(doc: Document, tag: string): RoutePoint[] {
  const nodes = doc.getElementsByTagName(tag);
  const out: RoutePoint[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]!;
    const lat = Number(attr(el, "lat"));
    const lon = Number(attr(el, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleNode = el.getElementsByTagName("ele")[0];
    const timeNode = el.getElementsByTagName("time")[0];
    out.push({
      lat,
      lon,
      ele: eleNode ? Number(eleNode.textContent) : undefined,
      time: timeNode?.textContent ?? undefined,
    });
  }
  return out;
}

function firstText(doc: Document, tag: string) {
  const n = doc.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() || "";
}

export function parseGpx(xml: string, filename = "rota.gpx"): ParsedRoute {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error("GPX inválido — não foi possível ler o arquivo.");

  const trk = collectPts(doc, "trkpt");
  const rte = collectPts(doc, "rtept");
  const wpt = collectPts(doc, "wpt");
  const points = trk.length >= 2 ? trk : rte.length >= 2 ? rte : wpt;

  if (points.length < 2) {
    throw new Error("O GPX precisa de pelo menos dois pontos (trkpt, rtept ou wpt).");
  }

  const name =
    firstText(doc, "name") ||
    filename.replace(/\.gpx$/i, "") ||
    "Derrota";

  return {
    name,
    points,
    distanceNm: pathLengthNm(points),
    source: filename,
  };
}

export async function parseGpxFile(file: File): Promise<ParsedRoute> {
  const text = await file.text();
  return parseGpx(text, file.name);
}
