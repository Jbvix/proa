/**
 * Proa · TugLife Systems — Testes das áreas de previsão
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.17.0 · 2026-09-21 12:00 UTC (ano 2026)
 *
 * As letras impressas na carta são a referência: cada uma tem de cair na
 * área de mesmo nome. Depois, portos e pontos ao largo conhecidos.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FORECAST_AREAS, forecastAreaAt, pointInPolygon } from "./atlas-areas.ts";

test("as dez letras da carta caem na área de mesmo nome", () => {
  // Posições das letras extraídas do PDF (centro do glifo).
  const letras: [string, number, number][] = [
    ["G", -2.98, -34.61], ["H", 3.0, -44.59], ["N", -0.6, -28.54], ["F", -9.21, -33.18],
    ["E", -17.16, -34.6], ["D", -22.15, -38.3], ["C", -25.7, -46.35], ["B", -29.33, -44.01],
    ["A", -32.07, -49.14], ["S", -26.12, -29.5],
  ];
  for (const [nome, lat, lon] of letras) {
    assert.equal(forecastAreaAt(lat, lon)?.nome, nome, `${nome} em (${lat}, ${lon})`);
  }
});

test("portos e pontos conhecidos", () => {
  const casos: [string, number, number, string][] = [
    ["Fortaleza", -3.72, -38.52, "G"],
    ["Pecém", -3.55, -38.8, "G"],
    ["Belém", -1.45, -48.5, "H"],
    ["Recife", -8.05, -34.88, "F"],
    // A linha E/F da carta toca a costa em Salvador: a baía fica em F, o mar
    // logo ao sul da barra já é E.
    ["Salvador, Baía de Todos os Santos", -12.85, -38.6, "F"],
    ["sul da barra de Salvador", -13.1, -38.3, "E"],
    ["Ilhéus (ao largo)", -14.8, -38.5, "E"],
    ["Vitória (ao largo)", -20.3, -39.5, "D"],
    ["Rio de Janeiro (ao largo)", -23.2, -43.2, "C"],
    ["Paranaguá", -25.5, -48.4, "C"],
    ["Rio Grande", -32.1, -52.0, "A"],
    ["ao largo, 26 S 29 W", -26.0, -29.0, "S"],
    ["Fernando de Noronha", -3.85, -32.42, "G"],
  ];
  for (const [nome, lat, lon, esperado] of casos) {
    assert.equal(forecastAreaAt(lat, lon)?.nome, esperado, nome);
  }
});

test("fora do atlas devolve null", () => {
  assert.equal(forecastAreaAt(10, -40), null);
  assert.equal(forecastAreaAt(-40, -50), null);
  assert.equal(forecastAreaAt(-10, -10), null);
});

test("os polígonos não se sobrepõem em pontos de amostra do mar", () => {
  // Varredura grossa: nenhum ponto ao largo pode cair em duas áreas, senão
  // a resposta dependeria da ordem da lista.
  let dupl = 0;
  let total = 0;
  for (let lat = -35; lat <= 6; lat += 1) {
    for (let lon = -52; lon <= -21; lon += 1) {
      const hits = FORECAST_AREAS.filter((a) => pointInPolygon(lat, lon, a.poligono));
      if (hits.length) total += 1;
      if (hits.length > 1) dupl += 1;
    }
  }
  assert.ok(total > 300, `poucos pontos cobertos: ${total}`);
  // Sobre uma aresta compartilhada dois polígonos respondem — isso é aceito;
  // sobreposição de ÁREA não.
  assert.ok(dupl <= 12, `${dupl} pontos em mais de uma área`);
});

test("pointInPolygon: dentro, fora, aresta", () => {
  const q: readonly (readonly [number, number])[] = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.equal(pointInPolygon(5, 5, q), true);
  assert.equal(pointInPolygon(11, 5, q), false);
  assert.equal(pointInPolygon(0, 5, q), true);
  assert.equal(pointInPolygon(1, 1, [[0, 0], [1, 1]]), false);
});
