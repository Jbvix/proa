/**
 * Proa · TugLife Systems — Testes da matemática de navegação
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.0.0
 * @data   2026-09-20 02:14 UTC  (ano 2026)
 *
 * `geo.ts` carregava 287 linhas sem um único teste — e é o módulo que decide
 * distância, rumo, XTE e ETA, ou seja, tudo que a Lara fala em voz alta no
 * passadiço. Aqui não se confere o código contra ele mesmo: cada caso é
 * amarrado a uma referência independente (a definição da milha náutica, a
 * simetria da distância, a geometria de um triângulo conhecido).
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EARTH_NM,
  alongTrack,
  bearingDeg,
  crossTrackOf,
  destPoint,
  distToPolylineNm,
  distToSegmentNm,
  haversineNm,
  knToMs,
  msToKn,
  nearestProgress,
  pathLengthNm,
  sampleRouteStations,
  toDeg,
  toRad,
  xteSideLabel,
} from "./geo.ts";

/** Tolerância relativa padrão: 0,1 % basta para navegação costeira. */
function perto(a: number, b: number, tol = 1e-3, msg = "") {
  const erro = Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
  assert.ok(erro < tol, `${msg} esperado ${b}, veio ${a} (erro ${erro})`);
}

/* --------------------------------------------------------------------- */
/* Distância                                                              */
/* --------------------------------------------------------------------- */

test("um grau de latitude vale um arco de 60 milhas náuticas", () => {
  // Referência independente: o comprimento de um grau num círculo máximo é
  // R·π/180, e a milha náutica foi definida justamente como um minuto de arco.
  const esperado = (EARTH_NM * Math.PI) / 180;
  perto(haversineNm(0, 0, 1, 0), esperado, 1e-9, "no equador:");
  perto(haversineNm(45, -38, 46, -38), esperado, 1e-9, "em 45°N:");
  // ≈ 60,04 mn — confere com a definição do minuto de arco.
  assert.ok(esperado > 60 && esperado < 60.1, `grau = ${esperado} mn`);
});

test("um grau de longitude encolhe com o cosseno da latitude", () => {
  // O paralelo é um círculo menor: seu raio é R·cos(φ). É por isso que a
  // derrota em latitude alta cobre menos milhas por grau de longitude.
  const noEquador = haversineNm(0, 0, 0, 1);
  const em60 = haversineNm(60, 0, 60, 1);
  perto(em60, noEquador * Math.cos(toRad(60)), 1e-4, "em 60°:");
});

test("a distância é simétrica e nula para o mesmo ponto", () => {
  const a = { lat: -3.7184, lon: -38.4732 }; // Fortaleza, fundeadouro
  const b = { lat: -3.4, lon: -38.9 };
  perto(haversineNm(a.lat, a.lon, b.lat, b.lon), haversineNm(b.lat, b.lon, a.lat, a.lon), 1e-12);
  assert.equal(haversineNm(a.lat, a.lon, a.lat, a.lon), 0);
});

test("a desigualdade triangular vale — o caminho quebrado nunca é mais curto", () => {
  const direto = haversineNm(-3.7, -38.5, -3.1, -39.2);
  const viaC = haversineNm(-3.7, -38.5, -3.4, -38.6) + haversineNm(-3.4, -38.6, -3.1, -39.2);
  assert.ok(viaC >= direto, `via C ${viaC} < direto ${direto}`);
});

/* --------------------------------------------------------------------- */
/* Rumo                                                                   */
/* --------------------------------------------------------------------- */

test("rumos cardeais saem nos quatro quadrantes certos", () => {
  perto(bearingDeg(0, 0, 1, 0) + 1, 0 + 1, 1e-9, "norte:");
  perto(bearingDeg(0, 0, 0, 1), 90, 1e-9, "leste:");
  perto(bearingDeg(1, 0, 0, 0), 180, 1e-9, "sul:");
  perto(bearingDeg(0, 1, 0, 0), 270, 1e-9, "oeste:");
});

test("o rumo sempre cai em [0, 360)", () => {
  for (const [lat, lon] of [
    [-3.7, -38.4],
    [10, 170],
    [-40, -179],
    [60, 5],
  ] as const) {
    const b = bearingDeg(0, 0, lat, lon);
    assert.ok(b >= 0 && b < 360, `rumo ${b} fora da rosa`);
  }
});

/* --------------------------------------------------------------------- */
/* Navegação direta e inversa                                             */
/* --------------------------------------------------------------------- */

test("navegar um rumo e uma distância fecha o problema inverso", () => {
  // Problema direto seguido do inverso: sair de A no rumo R por D milhas e
  // perguntar de volta quanto andou e em que rumo tem que devolver R e D.
  const a = { lat: -3.7184, lon: -38.4732 };
  for (const rumo of [0, 37, 90, 145, 180, 233, 270, 318]) {
    for (const dist of [0.5, 12, 80]) {
      const p = destPoint(a.lat, a.lon, rumo, dist);
      perto(haversineNm(a.lat, a.lon, p.lat, p.lon), dist, 1e-6, `rumo ${rumo} ${dist} mn:`);
      const volta = bearingDeg(a.lat, a.lon, p.lat, p.lon);
      perto(((volta - rumo + 540) % 360) + 1000, 180 + 1000, 1e-6, `rumo de volta ${rumo}:`);
    }
  }
});

test("a longitude do ponto de chegada fica normalizada em (-180, 180]", () => {
  const p = destPoint(0, 179.9, 90, 60); // cruza o antimeridiano
  assert.ok(p.lon >= -180 && p.lon <= 180, `lon ${p.lon} fora da faixa`);
  assert.ok(p.lon < 0, "atravessou para leste, a longitude deveria virar negativa");
});

test("radianos e graus são inversos um do outro", () => {
  for (const d of [0, 1, 45, 90, 179.9, -33]) perto(toDeg(toRad(d)) + 1000, d + 1000, 1e-12);
});

/* --------------------------------------------------------------------- */
/* Unidades                                                               */
/* --------------------------------------------------------------------- */

test("nós e metros por segundo convertem nos dois sentidos", () => {
  // 1 nó = 1852 m/h = 0,514444 m/s.
  perto(knToMs(1), 0.5144, 1e-3);
  perto(msToKn(1), 1.94384, 1e-6);
  for (const kn of [0, 3.5, 9.2, 14]) perto(msToKn(knToMs(kn)) + 100, kn + 100, 1e-9);
});

/* --------------------------------------------------------------------- */
/* Distância a segmento e a polilinha                                     */
/* --------------------------------------------------------------------- */

test("a distância a um segmento é perpendicular no meio e radial nas pontas", () => {
  // Segmento norte-sul de (0,0) a (1,0). Um ponto a leste, na altura do meio,
  // dista o próprio afastamento em longitude.
  const meio = distToSegmentNm(0.5, 0.1, 0, 0, 1, 0);
  perto(meio, haversineNm(0.5, 0, 0.5, 0.1), 1e-3, "perpendicular:");

  // Além da ponta norte, a distância passa a ser até o vértice, não até a reta.
  const alem = distToSegmentNm(2, 0, 0, 0, 1, 0);
  perto(alem, haversineNm(2, 0, 1, 0), 1e-6, "além da ponta:");
});

test("segmento degenerado não divide por zero", () => {
  const d = distToSegmentNm(0.1, 0, 0, 0, 0, 0);
  perto(d, haversineNm(0.1, 0, 0, 0), 1e-9);
});

test("a distância à polilinha é a menor entre todos os trechos", () => {
  const linha: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  // Ponto colado no cotovelo.
  assert.ok(distToPolylineNm(1.01, 0.99, linha) < 1.0);
  // Polilinha de um ponto só vira distância radial.
  perto(distToPolylineNm(1, 0, [[0, 0]]), haversineNm(1, 0, 0, 0), 1e-9);
  assert.equal(distToPolylineNm(1, 0, []), 0);
});

/* --------------------------------------------------------------------- */
/* XTE — o número que a Lara grita quando o rebocador sai da derrota       */
/* --------------------------------------------------------------------- */

test("XTE mede o afastamento perpendicular da derrota", () => {
  const derrota = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  const fora = crossTrackOf(derrota, 0.5, 0.05);
  perto(fora.nm, haversineNm(0.5, 0, 0.5, 0.05), 5e-3, "afastamento:");
  // Meia derrota andada: ~30 mn de um trecho de ~60 mn.
  perto(fora.alongNm, haversineNm(0, 0, 0.5, 0), 1e-3, "andado:");
});

test("bombordo e estibordo são lidos de quem está olhando a proa", () => {
  // Derrota rumo norte. Quem está a leste dela está a estibordo do rumo.
  const rumoNorte = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  assert.equal(crossTrackOf(rumoNorte, 0.5, 0.05).side, "EB");
  assert.equal(crossTrackOf(rumoNorte, 0.5, -0.05).side, "BB");

  // Invertendo o sentido da derrota, os bordos trocam — como tem de ser.
  const rumoSul = [
    { lat: 1, lon: 0 },
    { lat: 0, lon: 0 },
  ];
  assert.equal(crossTrackOf(rumoSul, 0.5, 0.05).side, "BB");
  assert.equal(crossTrackOf(rumoSul, 0.5, -0.05).side, "EB");
});

test("em cima da linha não há bordo a declarar", () => {
  const derrota = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  const emCima = crossTrackOf(derrota, 0.5, 0);
  assert.equal(emCima.side, "linha");
  assert.ok(emCima.nm < 0.04);
  assert.equal(xteSideLabel("linha"), "na linha");
  assert.equal(xteSideLabel("BB"), "bombordo");
  assert.equal(xteSideLabel("EB"), "estibordo");
});

test("XTE aguenta derrota vazia e derrota de ponto único", () => {
  assert.deepEqual(crossTrackOf([], 0, 0), { nm: 0, side: "linha", alongNm: 0 });
  const um = crossTrackOf([{ lat: 0, lon: 0 }], 1, 0);
  perto(um.nm, haversineNm(1, 0, 0, 0), 1e-9);
  assert.equal(um.side, "linha");
});

/* --------------------------------------------------------------------- */
/* Progresso ao longo da derrota                                          */
/* --------------------------------------------------------------------- */

test("o comprimento da derrota é a soma dos trechos", () => {
  const pts = [
    { lat: 0, lon: 0 },
    { lat: 0.5, lon: 0 },
    { lat: 0.5, lon: 0.5 },
  ];
  const soma =
    haversineNm(0, 0, 0.5, 0) + haversineNm(0.5, 0, 0.5, 0.5);
  perto(pathLengthNm(pts), soma, 1e-12);
  assert.equal(pathLengthNm([{ lat: 1, lon: 1 }]), 0);
});

test("alongTrack devolve posição, rumo e o que falta", () => {
  const pts = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  const total = pathLengthNm(pts);

  const meio = alongTrack(pts, total / 2)!;
  perto(meio.lat, 0.5, 1e-3, "latitude no meio:");
  perto(meio.progress, 0.5, 1e-6, "progresso:");
  perto(meio.remainNm, total / 2, 1e-6, "o que falta:");
  perto(meio.cog + 1, 0 + 1, 1e-9, "rumo:");

  // Pedir mais do que a derrota tem trava no destino, não extrapola.
  const alem = alongTrack(pts, total * 3)!;
  assert.equal(alem.remainNm, 0);
  perto(alem.progress, 1, 1e-9);

  // Antes de sair, nada andado.
  const zero = alongTrack(pts, 0)!;
  perto(zero.progress + 1, 0 + 1, 1e-9);
  assert.equal(alongTrack([{ lat: 0, lon: 0 }], 5), null);
});

test("nearestProgress reencontra o ponto da derrota mais perto do rebocador", () => {
  const pts = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  const total = pathLengthNm(pts);
  // O rebocador está ligeiramente fora da linha, na altura de 30 % da derrota.
  const alvo = alongTrack(pts, total * 0.3)!;
  const achado = nearestProgress(pts, alvo.lat + 0.001, alvo.lon + 0.002);
  perto(achado, total * 0.3, 5e-2, "progresso reencontrado:");
  assert.equal(nearestProgress([{ lat: 0, lon: 0 }], 0, 0), 0);
});

test("as estações de previsão cobrem origem e destino e vão em ordem", () => {
  const pts = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  const est = sampleRouteStations(pts, 5);
  assert.ok(est.length >= 2 && est.length <= 5);
  assert.equal(est[0]!.label, "Origem");
  assert.equal(est[est.length - 1]!.label, "Destino");
  assert.equal(est[0]!.distNm, 0);
  for (let i = 1; i < est.length; i++) {
    assert.ok(est[i]!.distNm > est[i - 1]!.distNm, "as estações têm de avançar");
  }
  assert.deepEqual(sampleRouteStations([]), []);
  assert.equal(sampleRouteStations([{ lat: 1, lon: 2 }])[0]!.label, "Origem");
});
