import { createFileRoute } from "@tanstack/react-router";
import { fetchMeteoUpstream, syntheticMeteo } from "@/lib/meteo";

export const Route = createFileRoute("/api/meteo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = Number(url.searchParams.get("lat") ?? "-3.718");
        const lon = Number(url.searchParams.get("lon") ?? "-38.473");
        const safeLat = Number.isFinite(lat) ? lat : -3.718;
        const safeLon = Number.isFinite(lon) ? lon : -38.473;
        try {
          const data = await fetchMeteoUpstream(safeLat, safeLon);
          return Response.json(data);
        } catch {
          return Response.json(syntheticMeteo(safeLat, safeLon));
        }
      },
    },
  },
});
