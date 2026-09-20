import { createFileRoute } from "@tanstack/react-router";
import { METEO_RULES, guardRequest, parseAllowedOrigins } from "@/lib/api-guard";
import { env } from "@/lib/env.server";
import { fetchMeteoUpstream, parseWaypointQuery, syntheticMeteo } from "@/lib/meteo";

export const Route = createFileRoute("/api/meteo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Porteiro antes de qualquer trabalho: quem for barrado não chega a
        // custar uma chamada ao Open-Meteo comercial.
        const barrado = guardRequest(request, {
          bucket: "meteo",
          rules: METEO_RULES,
          extraOrigins: parseAllowedOrigins(env("PROA_ALLOWED_ORIGINS")),
        });
        if (barrado) return barrado;

        const url = new URL(request.url);
        const lat = Number(url.searchParams.get("lat") ?? "-3.718");
        const lon = Number(url.searchParams.get("lon") ?? "-38.473");
        const safeLat = Number.isFinite(lat) ? lat : -3.718;
        const safeLon = Number.isFinite(lon) ? lon : -38.473;
        const waypoints = parseWaypointQuery(url.searchParams.get("wps"));
        const key = env("OPENMETEO_API_KEY") ?? "";
        try {
          const data = await fetchMeteoUpstream(safeLat, safeLon, key, waypoints);
          return Response.json(data, {
            headers: { "Cache-Control": "public, max-age=120" },
          });
        } catch {
          return Response.json(syntheticMeteo(safeLat, safeLon, Date.now(), waypoints));
        }
      },
    },
  },
});
