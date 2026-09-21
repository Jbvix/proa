/**
 * Proa · TugLife Systems — Testes do World Magnetic Model
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.16.0 · 2026-09-21 12:00 UTC (ano 2026)
 *
 * Duas amarras, de naturezas diferentes:
 *  1. Os VALORES DE TESTE OFICIAIS da NOAA para o WMM2025 (arquivo
 *     WMM2025_TEST_VALUES.txt, 12 pontos em três datas e duas alturas). Se a
 *     implementação desviar de 0,1 nT ou 0,01° em qualquer um, o porte do
 *     código legado tem um erro — e um erro aqui vale graus em algum lugar.
 *  2. O ATLAS DE CARTAS PILOTO da DHN, isogônicas de 2020: o modelo tem de
 *     cair dentro do que a carta mostra para a costa do Brasil, projetado
 *     pela variação anual da própria carta. É a conferência de que os sinais
 *     (oeste negativo) e a orientação (lat/lon) não foram trocados — o tipo
 *     de erro que passa por qualquer teste numérico e aparece só no mar.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decimalYear, declinationDeg, formatDeclination, magneticField } from "./wmm.ts";
import { WMM_COEFFICIENTS } from "./wmm-2025.ts";

/** [ano, altura km, lat, lon, X, Y, Z, H, F, I, D] — NOAA, WMM2025_TEST_VALUES.txt */
const NOAA: readonly (readonly number[])[] = [
  [2025.0, 0.0, 80.0, 0.0, 6521.6, 145.9, 54791.5, 6523.2, 55178.5, 83.21, 1.28],
  [2025.0, 0.0, 0.0, 120.0, 39677.8, -109.6, -10580.2, 39677.9, 41064.3, -14.93, -0.16],
  [2025.0, 0.0, -80.0, 240.0, 6117.5, 15751.9, -52022.5, 16898.1, 54698.2, -72.0, 68.78],
  [2025.0, 100.0, 80.0, 0.0, 6216.0, 92.4, 52598.8, 6216.7, 52964.9, 83.26, 0.85],
  [2025.0, 100.0, 0.0, 120.0, 37688.6, -96.2, -10152.1, 37688.7, 39032.1, -15.08, -0.15],
  [2025.0, 100.0, -80.0, 240.0, 5907.6, 14780.3, -49540.7, 15917.1, 52035.0, -72.19, 68.21],
  [2027.5, 0.0, 80.0, 0.0, 6500.8, 294.5, 54869.4, 6507.5, 55253.9, 83.24, 2.59],
  [2027.5, 0.0, 0.0, 120.0, 39701.6, -167.4, -10381.8, 39702.0, 41036.9, -14.65, -0.24],
  [2027.5, 0.0, -80.0, 240.0, 6200.7, 15730.3, -51783.7, 16908.3, 54474.2, -71.92, 68.49],
  [2027.5, 100.0, 80.0, 0.0, 6196.7, 233.8, 52670.5, 6201.1, 53034.3, 83.29, 2.16],
  [2027.5, 100.0, 0.0, 120.0, 37711.5, -148.7, -9969.8, 37711.8, 39007.4, -14.81, -0.23],
  [2027.5, 100.0, -80.0, 240.0, 5984.0, 14760.1, -49317.7, 15927.0, 51825.7, -72.1, 67.93],
];

test("os 90 coeficientes estão inteiros: graus 1–12, ordens 0–n, h₀ = 0", () => {
  assert.equal(WMM_COEFFICIENTS.length, 90);
  for (const [n, m, , h] of WMM_COEFFICIENTS) {
    assert.ok(n >= 1 && n <= 12 && m >= 0 && m <= n, `(${n},${m})`);
    if (m === 0) assert.equal(h, 0, `h(${n},0) tem de ser zero`);
  }
  // O dipolo principal: g₁⁰ ≈ −29 352 nT é a assinatura do WMM2025.
  assert.equal(WMM_COEFFICIENTS[0][2], -29351.8);
});

test("bate com os 12 valores de teste oficiais da NOAA a 0,1 nT e 0,01°", () => {
  for (const [year, h, lat, lon, X, Y, Z, H, F, I, D] of NOAA) {
    const r = magneticField(lat, lon, year, h);
    const tag = `${year} h=${h} (${lat},${lon})`;
    // A NOAA publica com uma casa; a tolerância é meia unidade da última casa.
    assert.ok(Math.abs(r.X - X) <= 0.15, `${tag} X ${r.X.toFixed(2)} ≠ ${X}`);
    assert.ok(Math.abs(r.Y - Y) <= 0.15, `${tag} Y ${r.Y.toFixed(2)} ≠ ${Y}`);
    assert.ok(Math.abs(r.Z - Z) <= 0.15, `${tag} Z ${r.Z.toFixed(2)} ≠ ${Z}`);
    assert.ok(Math.abs(r.H - H) <= 0.15, `${tag} H`);
    assert.ok(Math.abs(r.F - F) <= 0.15, `${tag} F`);
    assert.ok(Math.abs(r.I - I) <= 0.015, `${tag} I ${r.I.toFixed(3)} ≠ ${I}`);
    assert.ok(Math.abs(r.D - D) <= 0.015, `${tag} D ${r.D.toFixed(3)} ≠ ${D}`);
    assert.equal(r.stale, false, tag);
  }
});

test("cruzamento com o Atlas de Cartas Piloto: isogônicas de 2020 na costa do Brasil", () => {
  // Leituras feitas a olho na carta de janeiro (nº 14 200), isogônicas de
  // 2020. O modelo extrapolado para 2020 (cinco anos antes da época) tem de
  // cair na linha certa com ±1°: uma linha de 1° na carta tem uns 60 mn de
  // largura. O que este teste pega é troca de sinal ou de eixo — o erro que
  // passa por qualquer conta numérica e só aparece no mar.
  const casos: [string, number, number, number][] = [
    ["Fortaleza", -3.72, -38.52, -21],
    ["Recife", -8.05, -34.88, -22],
    ["Salvador", -12.97, -38.51, -23],
    ["Rio de Janeiro", -22.9, -43.17, -23],
    ["Rio Grande", -32.03, -52.1, -16],
    ["Chuí", -33.7, -53.4, -14],
  ];
  for (const [nome, lat, lon, carta] of casos) {
    const d = declinationDeg(lat, lon, 2020.0);
    assert.ok(Math.abs(d - carta) <= 1.0, `${nome}: WMM ${d.toFixed(2)}°, carta ${carta}°`);
    assert.ok(d < 0, `${nome}: no Brasil a variação é OESTE (negativa)`);
  }
});

test("a variação anual tem o sinal das linhas tracejadas: +8' no Nordeste, negativa no Sul", () => {
  // Na carta, os rótulos perto do Ceará são "8'" e "9'" sem sinal (positivo:
  // a declinação oeste DIMINUI) e no Sul aparecem "-1'", "-2'". Confere-se
  // o sinal e a ordem de grandeza nos dois extremos.
  const porAno = (lat: number, lon: number) =>
    ((declinationDeg(lat, lon, 2029.0) - declinationDeg(lat, lon, 2025.0)) / 4) * 60;
  const fortaleza = porAno(-3.72, -38.52);
  const rioGrande = porAno(-32.03, -52.1);
  assert.ok(fortaleza > 3 && fortaleza < 12, `Fortaleza ${fortaleza.toFixed(1)}'/ano, carta ~+8'`);
  assert.ok(rioGrande < 0, `Rio Grande ${rioGrande.toFixed(1)}'/ano, carta negativa`);
});

test("fora da janela 2025–2030 calcula mas avisa", () => {
  assert.equal(magneticField(-3.7, -38.5, 2024.0).stale, true);
  assert.equal(magneticField(-3.7, -38.5, 2031.0).stale, true);
  assert.equal(magneticField(-3.7, -38.5, 2027.0).stale, false);
});

test("entrada inválida lança, e polo não é permitido", () => {
  assert.throws(() => magneticField(91, 0, 2026));
  assert.throws(() => magneticField(0, 400, 2026));
  assert.throws(() => magneticField(90, 0, 2026));
});

test("ano decimal: 1º de janeiro é .0, 2 de julho é ~.5", () => {
  assert.equal(decimalYear(Date.UTC(2026, 0, 1)), 2026);
  const meio = decimalYear(Date.UTC(2026, 6, 2, 12));
  assert.ok(Math.abs(meio - 2026.5) < 0.002, String(meio));
});

test("formato de passadiço: graus, minutos com dois dígitos, W ou E", () => {
  assert.equal(formatDeclination(-22.3), "22°18' W");
  assert.equal(formatDeclination(3.5), "3°30' E");
  assert.equal(formatDeclination(0), "0°00'");
  // 59,6' arredonda para o grau seguinte, não para "60'".
  assert.equal(formatDeclination(-21.9933), "22°00' W");
});
