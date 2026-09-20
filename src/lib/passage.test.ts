/**
 * Proa · TugLife Systems — Testes da singradura
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.0.0
 * @data   2026-09-20 02:14 UTC  (ano 2026)
 *
 * `passage.ts` costura posição, derrota e velocidade num só objeto: quanto
 * andou, quanto falta, que horas chega, quanto está fora da linha. É o que
 * alimenta o Painel e a fala da Lara. Estava sem teste nenhum.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathLengthNm } from "./geo.ts";
import type { ParsedRoute } from "./gpx.ts";
import { passageOf, speedHint } from "./passage.ts";
import type { EngineSnapshot, Fix } from "./sensor-engine.ts";

/** Derrota norte-sul de ~60 mn: um grau de latitude, geometria fácil de conferir. */
function derrota(): ParsedRoute {
  const points = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
  ];
  return {
    name: "Teste",
    points,
    waypoints: [],
    distanceNm: pathLengthNm(points),
    source: "teste.gpx",
  };
}

function posicao(p: Partial<Fix> = {}): Fix {
  return {
    lat: 0.5,
    lon: 0,
    sogKn: 9.2,
    gpsKn: 9.2,
    trackKn: 9.2,
    valid: true,
    cogDeg: 0,
    accM: 4,
    t: Date.now(),
    ...p,
  };
}

function motor(p: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    mode: "live",
    capturing: true,
    fix: posicao(),
    attitude: null,
    wave: {
      heaveM: 0,
      hsM: 1.2,
      amplitudeM: 0.6,
      periodS: 7.4,
      perMin: 8.1,
      samples: 900,
      windowS: 90,
      trusted: true,
    },
    rollP2P: 0,
    hz: 10,
    imuHz: 60,
    simNm: 0,
    lastHourKey: 0,
    permission: "granted",
    ...p,
  };
}

/* --------------------------------------------------------------------- */

test("sem derrota ou sem posição não há singradura a relatar", () => {
  assert.equal(passageOf(null, motor()), null);
  assert.equal(passageOf(derrota(), null), null);
  assert.equal(passageOf(derrota(), motor({ fix: null })), null);

  // Derrota de um ponto só não é derrota.
  const curta: ParsedRoute = { ...derrota(), points: [{ lat: 0, lon: 0 }] };
  assert.equal(passageOf(curta, motor()), null);
});

test("no meio da derrota, metade andada e metade faltando", () => {
  const r = derrota();
  const p = passageOf(r, motor())!;
  const total = pathLengthNm(r.points);
  assert.ok(Math.abs(p.totalNm - total) < 1e-6);
  assert.ok(Math.abs(p.alongNm - total / 2) < 0.1, `andado ${p.alongNm}`);
  assert.ok(Math.abs(p.remainNm - total / 2) < 0.1, `falta ${p.remainNm}`);
  assert.ok(Math.abs(p.progress - 0.5) < 0.01, `progresso ${p.progress}`);
});

test("a ETA sai de milhas que faltam sobre a velocidade no fundo", () => {
  const r = derrota();
  const p = passageOf(r, motor())!;
  // etaMin = remainNm / SOG × 60. Com ~30 mn a 9,2 nós dá ~196 min.
  const esperado = (p.remainNm / 9.2) * 60;
  assert.ok(Math.abs(p.etaMin! - esperado) < 1e-6, `ETA ${p.etaMin} vs ${esperado}`);
  assert.ok(p.etaMs! > Date.now(), "a chegada tem de estar no futuro");
});

test("parado no cais não se inventa hora de chegada", () => {
  const r = derrota();
  // Abaixo de 0,4 nó é ruído de GPS, não singradura.
  for (const sog of [0, 0.2, 0.4]) {
    const p = passageOf(r, motor({ fix: posicao({ sogKn: sog }) }))!;
    assert.equal(p.etaMin, null, `SOG ${sog} não deveria dar ETA`);
    assert.equal(p.etaMs, null);
  }
  const andando = passageOf(r, motor({ fix: posicao({ sogKn: 0.5 }) }))!;
  assert.ok(andando.etaMin != null, "a 0,5 nó já há singradura");
});

test("fora da linha, o XTE aponta o bordo certo", () => {
  const r = derrota();
  // A leste de uma derrota rumo norte = estibordo.
  const eb = passageOf(r, motor({ fix: posicao({ lon: 0.05 }) }))!;
  assert.equal(eb.xteSide, "EB");
  assert.ok(eb.xteNm > 2, `XTE ${eb.xteNm} mn deveria ser sensível`);

  const bb = passageOf(r, motor({ fix: posicao({ lon: -0.05 }) }))!;
  assert.equal(bb.xteSide, "BB");

  const naLinha = passageOf(r, motor({ fix: posicao({ lon: 0 }) }))!;
  assert.equal(naLinha.xteSide, "linha");
  assert.ok(naLinha.xteNm < 0.04);
});

test("no simulador a derrota é perfeita por construção", () => {
  const r = derrota();
  // O simulador anda sobre a própria linha: XTE zero e progresso vindo do
  // contador de milhas, não da projeção da posição.
  const p = passageOf(r, motor({ mode: "sim", simNm: 12.5 }))!;
  assert.equal(p.xteNm, 0);
  assert.equal(p.xteSide, "linha");
  assert.equal(p.alongNm, 12.5);
});

test("a dica de velocidade diz de onde veio o número", () => {
  const validada = { valid: true, gpsKn: 9.2, trackKn: 9.1 };
  assert.equal(speedHint({ ...validada } as never), "validada");

  // GPS e derrota discordam: mostra os dois para o passadiço julgar.
  assert.match(
    speedHint({ valid: false, gpsKn: 9.2, trackKn: 4.0 } as never),
    /GPS 9\.2 · derrota 4\.0/,
  );
  assert.match(speedHint({ valid: false, gpsKn: null, trackKn: 4.0 } as never), /derrota 4\.0/);
  assert.match(speedHint({ valid: false, gpsKn: 9.2, trackKn: null } as never), /GPS 9\.2/);
  assert.equal(
    speedHint({ valid: false, gpsKn: null, trackKn: null } as never),
    "sem confirmação",
  );
});

test("a velocidade e a validação do fix atravessam intactas", () => {
  const r = derrota();
  const p = passageOf(r, motor({ fix: posicao({ sogKn: 7.3, gpsKn: 7.4, trackKn: 7.1, valid: false }) }))!;
  assert.equal(p.sogKn, 7.3);
  assert.equal(p.gpsKn, 7.4);
  assert.equal(p.trackKn, 7.1);
  assert.equal(p.valid, false);
});

test("chegando ao destino, o que falta zera sem virar negativo", () => {
  const r = derrota();
  const p = passageOf(r, motor({ fix: posicao({ lat: 1, lon: 0 }) }))!;
  assert.ok(p.remainNm >= 0, `falta ${p.remainNm} — não pode ser negativo`);
  assert.ok(p.remainNm < 0.2, `falta ${p.remainNm} no destino`);
  assert.ok(p.progress > 0.99);
});
