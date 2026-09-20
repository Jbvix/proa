/**
 * Proa · TugLife Systems — Handler de /api/meteo
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.3.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * POR QUE ESTE MÓDULO EXISTE
 * O endpoint tem DOIS pontos de entrada, e os dois estão vivos em alvos
 * diferentes: a rota TanStack/Nitro (`src/routes/api/meteo.ts`) serve no
 * desenvolvimento local e no sandbox de preview; a function Netlify
 * (`netlify/functions/meteo.mts`), que declara `path`, tem precedência em
 * produção. Até a 1.2.0 cada ponta carregava sua própria cópia da lógica, e
 * elas já tinham começado a divergir. Duas cartas para a mesma derrota é como
 * navegar sem saber qual está corrigida.
 *
 * Agora a lógica mora aqui e as duas pontas são cascas de três linhas.
 * ---------------------------------------------------------------------------
 */
import { METEO_RULES, guardRequest, parseAllowedOrigins } from "../api-guard.ts";
import { env } from "../env.server.ts";
import {
  fetchMeteoUpstream,
  parseWaypointQuery,
  syntheticMeteo,
} from "../meteo.ts";

/** Fundeadouro do Mucuripe — posição de partida quando o pedido vem sem coordenada. */
const FALLBACK_LAT = -3.718;
const FALLBACK_LON = -38.473;

function coord(raw: string | null, fallback: number) {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

export async function handleMeteo(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Porteiro antes de qualquer trabalho: quem for barrado não chega a custar
  // uma chamada ao Open-Meteo comercial.
  const barrado = guardRequest(req, {
    bucket: "meteo",
    rules: METEO_RULES,
    extraOrigins: parseAllowedOrigins(env("PROA_ALLOWED_ORIGINS")),
  });
  if (barrado) return barrado;

  const url = new URL(req.url);
  const lat = coord(url.searchParams.get("lat"), FALLBACK_LAT);
  const lon = coord(url.searchParams.get("lon"), FALLBACK_LON);
  const waypoints = parseWaypointQuery(url.searchParams.get("wps"));
  const key = env("OPENMETEO_API_KEY") ?? "";

  try {
    const data = await fetchMeteoUpstream(lat, lon, key, waypoints);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch {
    // Open-Meteo fora do ar não pode apagar o painel do passadiço: devolve um
    // boletim sintético, que o cliente já marca como aproximado.
    return Response.json(syntheticMeteo(lat, lon, Date.now(), waypoints));
  }
}
