import type { Config } from "@netlify/functions";
import { handleMeteo } from "../../src/lib/api/meteo-handler";

/** Ponta Netlify. Declara `path`, então tem precedência sobre o SSR em
 *  produção. A lógica é a mesma da rota Nitro — ver o handler. */
export default (req: Request) => handleMeteo(req);

export const config: Config = {
  path: "/api/meteo",
};
