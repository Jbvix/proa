import { pathLengthNm, type LatLon } from "./geo";

export type RoutePoint = LatLon & { ele?: number; time?: string };

export type ParsedRoute = {
  name: string;
  points: RoutePoint[];
  distanceNm: number;
  source: string;
};

function localName(el: Element) {
  const raw = el.localName || el.tagName;
  const i = raw.indexOf(":");
  return (i >= 0 ? raw.slice(i + 1) : raw).toLowerCase();
}

function childText(el: Element, tag: string) {
  const kids = el.children;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]!;
    if (localName(k) === tag) return k.textContent?.trim() || "";
  }
  return "";
}

function collectPts(doc: Document, tag: string): RoutePoint[] {
  const all = doc.getElementsByTagName("*");
  const out: RoutePoint[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (localName(el) !== tag) continue;
    const lat = Number(el.getAttribute("lat"));
    const lon = Number(el.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleRaw = childText(el, "ele");
    const time = childText(el, "time");
    const ele = eleRaw ? Number(eleRaw) : undefined;
    out.push({
      lat,
      lon,
      ele: ele != null && Number.isFinite(ele) ? ele : undefined,
      time: time || undefined,
    });
  }
  return out;
}

function firstText(doc: Document, tag: string) {
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (localName(el) !== tag) continue;
    const t = el.textContent?.trim();
    if (t) return t;
  }
  return "";
}

export function parseGpx(xml: string, filename = "rota.gpx"): ParsedRoute {
  const cleaned = xml.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("Arquivo GPX vazio.");
  const doc = new DOMParser().parseFromString(cleaned, "text/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error("GPX inválido — não foi possível ler o arquivo.");

  const trk = collectPts(doc, "trkpt");
  const rte = collectPts(doc, "rtept");
  const wpt = collectPts(doc, "wpt");
  const points = trk.length >= 2 ? trk : rte.length >= 2 ? rte : wpt;

  if (points.length < 2) {
    throw new Error(
      "A derrota precisa de um track, rota ou pelo menos dois waypoints no GPX.",
    );
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
  return parseGpx(text, file.name || "derrota.gpx");
}
