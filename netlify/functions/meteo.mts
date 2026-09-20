import type { Config } from "@netlify/functions";
import {
  METEO_RULES,
  guardRequest,
  parseAllowedOrigins,
} from "../../src/lib/api-guard";
import {
  fetchMeteoUpstream,
  parseWaypointQuery,
  syntheticMeteo,
} from "../../src/lib/meteo";

function coord(raw: string | null, fallback: number) {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Porteiro antes de qualquer trabalho: quem for barrado não chega a
  // custar uma chamada ao Open-Meteo comercial.
  const barrado = guardRequest(req, {
    bucket: "meteo",
    rules: METEO_RULES,
    extraOrigins: parseAllowedOrigins(process.env.PROA_ALLOWED_ORIGINS),
  });
  if (barrado) return barrado;

  const url = new URL(req.url);
  const lat = coord(url.searchParams.get("lat"), -3.718);
  const lon = coord(url.searchParams.get("lon"), -38.473);
  const waypoints = parseWaypointQuery(url.searchParams.get("wps"));
  const key = (process.env.OPENMETEO_API_KEY ?? "").trim();

  try {
    const data = await fetchMeteoUpstream(lat, lon, key, waypoints);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch {
    return Response.json(syntheticMeteo(lat, lon, Date.now(), waypoints));
  }
};

export const config: Config = {
  path: "/api/meteo",
};
