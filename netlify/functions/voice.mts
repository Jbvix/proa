import type { Config } from "@netlify/functions";
import { handleVoice } from "../../src/lib/api/voice-handler";

/** Ponta Netlify. Declara `path`, então tem precedência sobre o SSR em
 *  produção. A lógica é a mesma da rota Nitro — ver o handler. */
export default (req: Request) => handleVoice(req);

export const config: Config = {
  path: "/api/voice",
};
