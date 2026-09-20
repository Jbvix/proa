import { createFileRoute } from "@tanstack/react-router";
import { handleVoice } from "@/lib/api/voice-handler";

/** Ponta Nitro. A lógica mora em `src/lib/api/voice-handler.ts`, partilhada
 *  com a function Netlify — ver o cabeçalho de lá sobre os dois alvos. */
export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: ({ request }) => handleVoice(request),
      // Aquecimento (1.11.0): o handler devolve 204 sem custo.
      GET: ({ request }) => handleVoice(request),
    },
  },
});
