import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detrend,
  hullWaveFromHeave,
  hsFromHeaveStd,
  stdev,
  correctChainHs,
  heaveResponseGain,
  HeaveIntegrator,
  seaStateFromHs,
  seaTone,
  SEA_STATE_TABLE,
  HS_HULL_MAX,
} from "./waves.ts";

test("detrend removes a linear ramp that would fake a huge Hs", () => {
  const n = 900;
  const ramp = Float32Array.from({ length: n }, (_, i) => i * 0.1);
  const rawHs = hsFromHeaveStd(stdev(ramp));
  assert.ok(rawHs > 50, `ramp Hs should be huge, got ${rawHs}`);
  const d = detrend(ramp);
  const hs = hsFromHeaveStd(stdev(d));
  assert.ok(hs < 0.05, `detrended Hs ${hs}`);
});

test("sine 1 m / 8 s at 10 Hz yields Hs ≈ 2.8 m, not hundreds", () => {
  const dt = 0.1;
  const T = 8;
  const A = 1;
  const n = 800;
  const s = Float32Array.from(
    { length: n },
    (_, i) => A * Math.sin((2 * Math.PI * i * dt) / T),
  );
  const w = hullWaveFromHeave(s, dt);
  assert.ok(w.hsM > 2.4 && w.hsM < 3.2, `hs ${w.hsM}`);
  assert.ok(w.periodS > 7 && w.periodS < 9, `Tz ${w.periodS}`);
  assert.equal(w.clamped, false);
});

test("drifted heave is clamped at hull max", () => {
  const dt = 0.1;
  const s = Float32Array.from(
    { length: 400 },
    (_, i) => 12 * Math.sin((2 * Math.PI * i * dt) / 8),
  );
  const w = hullWaveFromHeave(s, dt);
  assert.equal(w.hsM, HS_HULL_MAX);
  assert.equal(w.clamped, true);
});

/* ===========================================================================
 * Proa · TugLife Systems — Regressão da cadeia de heave
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.1.0
 * @data   2026-09-20 02:14 UTC  (ano 2026)
 *
 * Estes testes existem por um motivo específico: na versão 1.0.0 a cadeia de
 * integração lia 16 % do Hs real numa onda de 8 s e 4,7 % numa de 12 s, e
 * ninguém percebeu porque não havia um único teste que injetasse mar conhecido
 * e conferisse o que saía. A milha medida do corrediço é isto aqui.
 * ========================================================================= */

/**
 * Passa um mar senoidal conhecido pela cadeia real e devolve o que ela lê.
 *
 * A senoide de elevação z(t) = A·sin(ωt) tem desvio padrão σ = A/√2, e como
 * Hs = 4σ, então A = Hs·√2/4. A aceleração vertical correspondente é a
 * segunda derivada: a(t) = −A·ω²·sin(ωt) — que é o que o acelerômetro sentiria.
 *
 * @param periodS período da onda em segundos
 * @param hsM     altura significativa que se quer simular, em metros
 * @param dt      passo de amostragem em segundos
 */
function marSenoidal(periodS: number, hsM: number, dt = 0.1) {
  const amp = (hsM * Math.SQRT2) / 4;
  const w = (2 * Math.PI) / periodS;
  const chain = new HeaveIntegrator();
  const n = Math.round(400 / dt); // 400 s: sobra pro transiente do filtro morrer
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const acc = -amp * w * w * Math.sin(w * i * dt);
    out[i] = chain.push(acc, dt).heave;
  }
  // Só a cauda: a janela de estatística do app é de 90 s a 10 Hz.
  const tail = out.slice(-900);
  const w2 = hullWaveFromHeave(tail, dt);
  return {
    hsCru: w2.hsM,
    tz: w2.periodS,
    hsCorrigido: correctChainHs(w2.hsM, w2.periodS, dt),
  };
}

test("a cadeia entrega o Hs verdadeiro depois da compensação de ganho", () => {
  // Faixa costeira de rebocador: vaga curta de 4 s até swell de 14 s.
  for (const T of [4, 5, 6, 8, 10, 12, 14]) {
    const alvo = 1.5;
    const r = marSenoidal(T, alvo);
    const erro = Math.abs(r.hsCorrigido - alvo) / alvo;
    assert.ok(
      erro < 0.1,
      `T=${T}s: esperado ~${alvo} m, veio ${r.hsCorrigido.toFixed(3)} m (erro ${(erro * 100).toFixed(1)}%)`,
    );
    assert.ok(
      Math.abs(r.tz - T) / T < 0.1,
      `T=${T}s: Tz lido ${r.tz.toFixed(2)} s`,
    );
  }
});

test("REGRESSÃO 1.0.0: a cadeia não colapsa mais em onda longa", () => {
  // A realimentação `disp = heave` da 1.0.0 derrubava o ganho cru para 0,157
  // em 8 s e 0,047 em 12 s. Sem ela, o ganho cru fica na casa prevista pela
  // função de transferência. Este teste falha se alguém reintroduzir o laço.
  const oito = marSenoidal(8, 1.5);
  const doze = marSenoidal(12, 1.5);
  assert.ok(
    oito.hsCru / 1.5 > 0.55,
    `ganho cru em 8 s caiu para ${(oito.hsCru / 1.5).toFixed(3)} — a realimentação voltou?`,
  );
  assert.ok(
    doze.hsCru / 1.5 > 0.35,
    `ganho cru em 12 s caiu para ${(doze.hsCru / 1.5).toFixed(3)} — a realimentação voltou?`,
  );
});

test("o ganho analítico bate com o ganho medido na bancada", () => {
  for (const T of [4, 6, 8, 10, 12, 14]) {
    const medido = marSenoidal(T, 1.5).hsCru / 1.5;
    const analitico = heaveResponseGain(T, 0.1);
    assert.ok(
      Math.abs(medido - analitico) / analitico < 0.03,
      `T=${T}s: medido ${medido.toFixed(4)} vs analítico ${analitico.toFixed(4)}`,
    );
  }
});

test("o ganho cai monotonicamente conforme a onda alonga", () => {
  // Documenta a física: passa-altas cegam para o swell longo, não para a vaga.
  let anterior = Infinity;
  for (const T of [4, 6, 8, 10, 12, 14, 16]) {
    const g = heaveResponseGain(T, 0.1);
    assert.ok(g > 0 && g <= 1, `T=${T}s: ganho ${g} fora de (0,1]`);
    assert.ok(g < anterior, `T=${T}s: ganho ${g} não caiu face ao anterior`);
    anterior = g;
  }
});

test("sem período confiável a compensação não chuta", () => {
  assert.equal(correctChainHs(0.8, 0, 0.1), 0.8);
  assert.equal(correctChainHs(0.8, -1, 0.1), 0.8);
  assert.equal(correctChainHs(0, 8, 0.1), 0);
});

test("o integrador descarrega quando alguém sacode o aparelho", () => {
  const chain = new HeaveIntegrator();
  // Regime calmo primeiro, pra cadeia assentar.
  for (let i = 0; i < 600; i++) chain.push(0.02 * Math.sin(i / 10), 0.1);
  // Safanão: bem acima do HEAVE_ACC_SPIKE de 2,8 m/s².
  const r = chain.push(9.0, 0.1);
  assert.equal(r.spike, true, "o pico deveria ter sido sinalizado");
  const calmo = chain.push(0.0, 0.1);
  assert.equal(calmo.spike, false);
});

test("reset limpa o estado entre capturas", () => {
  const chain = new HeaveIntegrator();
  for (let i = 0; i < 300; i++) chain.push(Math.sin(i / 3), 0.1);
  chain.reset();
  // Depois do reset, entrada nula tem de sair nula — sem memória da captura
  // anterior vazando pro mar novo.
  assert.equal(chain.push(0, 0.1).heave, 0);
});

/* ===========================================================================
 * Escala de estado do mar — Douglas / WMO 3700
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.1.0 · 2026-09-20
 *
 * A versão 1.0.0 numerava a partir de 0 na faixa 0–0,1 m, deslocando todo grau
 * em 1 face ao padrão e truncando em 7. Quem reportasse à praticagem estaria
 * um grau abaixo do que a escala manda.
 * ========================================================================= */

test("os graus batem com a tabela Douglas / WMO 3700", () => {
  // Cada par é (Hs em metros, grau que a publicação manda).
  const referencia: Array<[number, number]> = [
    [0, 0],
    [0.05, 1],
    [0.09, 1],
    [0.1, 2],
    [0.49, 2],
    [0.5, 3],
    [1.24, 3],
    [1.25, 4],
    [2.49, 4],
    [2.5, 5],
    [3.99, 5],
    [4, 6],
    [5.99, 6],
    [6, 7],
    [8.99, 7],
    [9, 8],
    [13.99, 8],
    [14, 9],
    [30, 9],
  ];
  for (const [hs, grau] of referencia) {
    assert.equal(seaStateFromHs(hs).code, grau, `Hs ${hs} m deveria ser grau ${grau}`);
  }
});

test("a escala vai até 9 — mar excepcional existe e tem nome", () => {
  // A 1.0.0 parava em 7 e jogava tudo acima de 9 m no mesmo balde.
  assert.equal(seaStateFromHs(20).code, 9);
  assert.equal(seaStateFromHs(10).code, 8);
  assert.notEqual(seaStateFromHs(10).label, seaStateFromHs(20).label);
});

test("a tabela é contínua, crescente e sem buraco", () => {
  let tetoAnterior = 0;
  SEA_STATE_TABLE.forEach((grau, i) => {
    assert.equal(grau.code, i, `o grau na posição ${i} deveria ser ${i}`);
    assert.ok(grau.maxHs > tetoAnterior, `teto ${grau.maxHs} não avançou`);
    assert.ok(grau.label.length > 0 && grau.hint.length > 0);
    tetoAnterior = grau.maxHs;
  });
  assert.equal(SEA_STATE_TABLE[SEA_STATE_TABLE.length - 1]!.maxHs, Infinity);
});

test("entrada suja não quebra a escala", () => {
  for (const ruim of [NaN, -1, -0.5, Infinity]) {
    const s = seaStateFromHs(ruim);
    assert.ok(s.code >= 0 && s.code <= 9, `Hs ${ruim} deu grau ${s.code}`);
  }
  assert.equal(seaStateFromHs(NaN).code, 0);
  assert.equal(seaStateFromHs(-3).code, 0);
});

test("o selo dispara na ALTURA certa, não no número do grau", () => {
  // Os pontos de disparo são os mesmos de antes da renumeração: âmbar a partir
  // de 1,25 m e vermelho a partir de 2,5 m. Se alguém mexer na escala sem
  // mexer aqui, este teste cai.
  assert.equal(seaTone(seaStateFromHs(0.8).code), "accent");
  assert.equal(seaTone(seaStateFromHs(1.24).code), "accent");
  assert.equal(seaTone(seaStateFromHs(1.25).code), "warn");
  assert.equal(seaTone(seaStateFromHs(2.49).code), "warn");
  assert.equal(seaTone(seaStateFromHs(2.5).code), "danger");
  assert.equal(seaTone(seaStateFromHs(9).code), "danger");
});
