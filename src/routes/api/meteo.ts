import { createFileRoute } from "@tanstack/react-router";
import { handleMeteo } from "@/lib/api/meteo-handler";

/** Ponta Nitro. A lógica mora em `src/lib/api/meteo-handler.ts`, partilhada
 *  com a function Netlify — ver o cabeçalho de lá sobre os dois alvos. */
export const Route = createFileRoute("/api/meteo")({
  server: {
    handlers: {
      GET: ({ request }) => handleMeteo(request),
    },
  },
});
