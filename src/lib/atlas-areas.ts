/**
 * Proa · TugLife Systems — Áreas de previsão da Marinha (Atlas de Cartas Piloto)
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.17.0  (módulo novo nesta versão)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P15, item 15.7)
 * O boletim Meteoromarinha que o passadiço ouve no rádio fala por letra:
 * "área G", "área D". A carta piloto da DHN desenha essas áreas em cinza —
 * A a H ao longo da costa, N e S ao largo. Com a posição do GPS, a Lara
 * passa a dizer em que área o rebocador está, e a tripulação correlaciona
 * com o boletim sem olhar carta nenhuma.
 *
 * DE ONDE VÊM OS POLÍGONOS
 * As 16 arestas cinza foram EXTRAÍDAS do PDF vetorial (`scripts/atlas-extract.py`,
 * resíduo de georreferência < 0,04°) e os polígonos foram MONTADOS À MÃO a
 * partir delas — a carta só traça o lado do mar; o lado de terra é fechado
 * aqui por vértices postos em terra, de propósito e com folga, para que um
 * rebocador atracado caia na área daquele trecho de costa. A letra de cada
 * área foi conferida contra a posição impressa na carta.
 *
 * Fonte: Atlas de Cartas Piloto, DHN/Marinha do Brasil, 2ª ed. Dado derivado
 * para FINALIDADE EDUCATIVA apenas; não substitui as publicações oficiais.
 * ---------------------------------------------------------------------------
 */

/** [lat, lon], graus, + norte / + leste. */
export type LatLon = readonly [number, number];

export type ForecastArea = {
  nome: string;
  /** Descrição de passadiço do trecho. */
  trecho: string;
  poligono: readonly LatLon[];
};

export const FORECAST_AREAS: readonly ForecastArea[] = [
  {
    nome: "H",
    trecho: "Guianas e Amapá até São Luís",
    poligono: [[6.94, -48.19], [6.94, -54.0], [-3.0, -50.5], [-2.4, -43.39], [1.15, -37.11]],
  },
  {
    nome: "G",
    trecho: "São Luís a Natal (Ceará, Piauí, Maranhão oriental)",
    poligono: [[1.15, -37.11], [-2.4, -43.39], [-5.0, -43.0], [-5.79, -35.15], [-4.65, -32.63], [-4.05, -31.32], [-3.04, -29.1]],
  },
  {
    nome: "N",
    trecho: "Ao largo do Nordeste, do Equador a 15° S, leste da diagonal",
    poligono: [[6.94, -20.07], [6.94, -48.19], [-3.04, -29.1], [-10.06, -29.1], [-15.05, -33.04], [-15.05, -20.07]],
  },
  {
    nome: "F",
    trecho: "Natal a Salvador",
    poligono: [[-3.04, -29.1], [-4.05, -31.32], [-4.65, -32.63], [-5.79, -35.15], [-9.5, -38.5], [-13.6, -39.6], [-12.96, -38.35], [-15.05, -33.04], [-10.06, -29.1]],
  },
  {
    nome: "E",
    trecho: "Salvador a Caravelas (Abrolhos)",
    poligono: [[-12.96, -38.35], [-15.05, -33.04], [-21.12, -33.04], [-17.9, -39.22], [-15.5, -41.5], [-13.6, -39.6]],
  },
  {
    nome: "D",
    trecho: "Caravelas a Cabo Frio (Espírito Santo e norte do Rio)",
    poligono: [[-17.9, -39.22], [-21.12, -33.04], [-23.84, -35.58], [-25.67, -37.33], [-26.68, -38.3], [-23.06, -42.09], [-21.0, -41.6], [-19.0, -40.4]],
  },
  {
    nome: "S",
    trecho: "Ao largo do Sudeste e Sul, ao sul de 15° S, leste da diagonal",
    poligono: [[-15.05, -33.04], [-15.05, -20.07], [-36.07, -20.07], [-36.07, -47.82], [-25.67, -37.33], [-21.12, -33.04]],
  },
  {
    nome: "C",
    trecho: "Cabo Frio a Florianópolis, faixa costeira (Rio, Santos, Paranaguá)",
    poligono: [[-23.06, -42.09], [-28.69, -48.84], [-26.5, -50.5], [-23.0, -46.5], [-22.5, -43.5]],
  },
  {
    nome: "B",
    trecho: "Cabo Frio a Florianópolis, ao largo",
    poligono: [[-23.06, -42.09], [-26.68, -38.3], [-31.99, -43.57], [-28.69, -48.84]],
  },
  {
    nome: "A",
    trecho: "Florianópolis ao Chuí (Rio Grande do Sul)",
    poligono: [[-28.69, -48.84], [-31.99, -43.57], [-36.07, -47.82], [-33.92, -53.3], [-30.0, -52.5]],
  },
];

/**
 * Ponto dentro do polígono (traçado de raio). Aresta conta como dentro.
 *
 * Comportamento conforme as variáveis:
 *   polígono com menos de 3 vértices → `false`
 *   ponto sobre uma aresta           → `true` (rebocador na fronteira pertence
 *                                       às duas; devolve-se a primeira da lista)
 */
export function pointInPolygon(lat: number, lon: number, poly: readonly LatLon[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    // Sobre a aresta?
    const cross = (xj - xi) * (lat - yi) - (yj - yi) * (lon - xi);
    if (Math.abs(cross) < 1e-9 && Math.min(xi, xj) - 1e-9 <= lon && lon <= Math.max(xi, xj) + 1e-9 &&
        Math.min(yi, yj) - 1e-9 <= lat && lat <= Math.max(yi, yj) + 1e-9) return true;
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * A área de previsão da Marinha em que a posição cai, ou `null` fora do
 * atlas (norte de 7° N, sul de 36° S, leste de 20° W, ou terra adentro).
 */
export function forecastAreaAt(lat: number, lon: number): ForecastArea | null {
  for (const a of FORECAST_AREAS) if (pointInPolygon(lat, lon, a.poligono)) return a;
  return null;
}
