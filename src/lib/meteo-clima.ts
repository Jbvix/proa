/**
 * Proa · TugLife Systems — Boletim de climatologia (fallback honesto)
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.18.0  (módulo novo nesta versão)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * O QUE ISTO CORRIGE (P15, item 15.3)
 * Sem rede, o app devolvia um "boletim sintético": vento de 14 nós de 085°,
 * Hs 1,25 m, corrente 0,4 nó para 310° — números INVENTADOS, iguais em
 * Fortaleza e no Chuí, em janeiro e em julho, e carimbados `plano:
 * "gratuito"`, indistinguíveis de dado real na tela. Um passadiço tomava
 * decisão sobre um mar que nunca existiu.
 *
 * Agora, sem rede, o boletim vem do Atlas de Cartas Piloto da DHN: o vento
 * predominante do mês na célula (direção do octante, força Beaufort virando
 * nós pelo meio da faixa), o Hs que a carta Beaufort associa a essa força, a
 * corrente típica, e `plano: "climatologia"` — que o Painel mostra em
 * amarelo. É média de 1985–2013 numa célula de 300 milhas, e é dito assim.
 * Melhor um dado honesto e datado do que um número bonito e falso.
 *
 * O QUE FICA NULO, DE PROPÓSITO
 * Temperatura, pressão, visibilidade, período de onda, código de tempo: o
 * atlas não os dá por ponto (isotermas e isóbaras são linhas, não foram
 * extraídas). Nulo é "não sei"; zero seria mentira. As 24 horas saem PLANAS:
 * climatologia não tem ciclo diurno.
 *
 * Puro: entra posição, data e waypoints; sai o boletim ou `null` quando o
 * atlas não cobre a posição. Quem chama decide o que fazer com o `null`.
 * ---------------------------------------------------------------------------
 */
import { BEAUFORT, expectedHsFromWindKn } from "./beaufort.ts";
import { atlasMonth, nearestCurrent, nearestRose, rankedOctants, type Octant } from "./atlas.ts";
import type { MeteoBundle, MeteoHour, RouteStation, StationInput } from "./meteo.ts";
import { syntheticTide } from "./meteo.ts";

/** Rumo DE ONDE sopra, por octante. */
const OCT_FROM_DEG: Record<Octant, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** Nós no meio da faixa de uma força Beaufort; força desconhecida → F4 (moderado), a mais comum na costa. */
export function knFromBeaufort(bf: number | null): number {
  const row = BEAUFORT[bf ?? 4];
  if (!row || !Number.isFinite(row.maxKn)) return 14;
  return Math.round(((row.minKn + row.maxKn) / 2) * 10) / 10;
}

type Cell = {
  windKn: number;
  windDir: number;
  waveHs: number | null;
  currentKn: number | null;
  currentDir: number | null;
};

/** A célula climatológica de uma posição, ou `null` sem rosa no alcance. */
export function climatologyCell(lat: number, lon: number, mes: number): Cell | null {
  const r = nearestRose(lat, lon, mes);
  if (!r) return null;
  const top = rankedOctants(r.item)[0];
  if (!top) return null;
  const windKn = knFromBeaufort(top.bf);
  const c = nearestCurrent(lat, lon, mes);
  return {
    windKn,
    windDir: OCT_FROM_DEG[top.oct],
    waveHs: expectedHsFromWindKn(windKn),
    currentKn: c?.item.kn ?? null,
    currentDir: c?.item.dir ?? null,
  };
}

/**
 * O boletim de climatologia para a posição, na data, com as estações da
 * derrota. `null` fora da cobertura do atlas.
 *
 * Comportamento conforme as variáveis:
 *   sem rosa no alcance da posição  → `null`
 *   waypoint sem rosa no alcance    → estação com campos nulos, não inventados
 *   corrente sem rótulo de nós      → `currentKn` nulo, direção presente
 */
export function climatologyMeteo(
  lat: number,
  lon: number,
  nowMs = Date.now(),
  waypoints: StationInput[] = [],
): MeteoBundle | null {
  const mes = new Date(nowMs).getMonth() + 1;
  const cell = climatologyCell(lat, lon, mes);
  if (!cell) return null;
  const start = Math.floor(nowMs / 3_600_000) * 3_600_000 - 6 * 3_600_000;
  const hourly: MeteoHour[] = [];
  for (let i = 0; i < 24; i++) {
    hourly.push({
      t: start + i * 3_600_000,
      windKn: cell.windKn,
      windDir: cell.windDir,
      gustKn: Math.round(cell.windKn * 1.3),
      waveHs: cell.waveHs,
      waveDir: cell.windDir,
      wavePeriod: null,
      swellHs: null,
      currentKn: cell.currentKn,
      currentDir: cell.currentDir,
    });
  }
  const alongRoute: RouteStation[] = waypoints.map((wp, i) => {
    const c = climatologyCell(wp.lat, wp.lon, mes);
    return {
      lat: wp.lat,
      lon: wp.lon,
      distNm: wp.distNm ?? 0,
      label: wp.label ?? (i === 0 ? "Origem" : i === waypoints.length - 1 ? "Destino" : `WP ${i + 1}`),
      waveHs: c?.waveHs ?? null,
      waveDir: c?.windDir ?? null,
      wavePeriod: null,
      swellHs: null,
      currentKn: c?.currentKn ?? null,
      currentDir: c?.currentDir ?? null,
    };
  });
  return {
    now: {
      fetchedAt: nowMs,
      lat,
      lon,
      tempC: null,
      weatherCode: null,
      windKn: cell.windKn,
      windDir: cell.windDir,
      gustKn: Math.round(cell.windKn * 1.3),
      pressureHpa: null,
      visibilityM: null,
      waveHs: cell.waveHs,
      waveDir: cell.windDir,
      wavePeriod: null,
      wavePeak: null,
      swellHs: null,
      swellPeriod: null,
      windWaveHs: cell.waveHs,
      sstC: null,
      currentKn: cell.currentKn,
      currentDir: cell.currentDir,
    },
    hourly,
    alongRoute,
    tideHours: syntheticTide(nowMs),
    plano: "climatologia",
  };
}

/** Nome do mês do atlas para o rótulo da tela. */
export function climatologyMonthName(nowMs = Date.now()): string {
  return atlasMonth(new Date(nowMs).getMonth() + 1).nome;
}
