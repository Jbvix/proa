import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HULL,
  DEFAULT_PROFILE,
  addedResistanceKn,
  addedResistanceN,
  fuelHint,
  recommendRpm,
  waveSteepness,
} from "./rpm.ts";
import { nearestPlaceAny } from "./places.ts";

test("nearest coast from Mucuripe is Mucuripe or Fortaleza", () => {
  const p = nearestPlaceAny(-3.718, -38.473);
  assert.match(p.name, /Mucuripe|Fortaleza/);
  assert.ok(p.nm < 4);
});

test("nearest coast always returns a place even far offshore", () => {
  const p = nearestPlaceAny(-3.2, -37.5);
  assert.ok(p.name.length > 1);
  assert.ok(p.nm > 18);
});

test("fuel hint cuts RPM when following sea and rpm is high", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 1260,
    hsM: 1.9,
    periodS: 6.5,
    windKn: 14,
    headingDeg: 300,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "popa" },
    currentRpm: 1260,
    headingDeg: 300,
    windKn: 14,
    windDir: 130,
    currentKn: 0.8,
    currentDir: 270,
  });
  assert.ok(fuel.rpmSugerido < 1260);
  assert.ok(fuel.rpmSugerido >= advice.min);
  assert.match(fuel.conselho.toLowerCase(), /rpm|faixa|favor|popa|vento|corrente/);
});

test("fuel hint does not drop below band center in head sea", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 980,
    hsM: 2.2,
    periodS: 6,
    windKn: 18,
    headingDeg: 90,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "proa" },
    currentRpm: 980,
    headingDeg: 90,
    windKn: 18,
    windDir: 90,
    currentKn: 0.5,
    currentDir: 270,
  });
  assert.equal(fuel.rpmSugerido, advice.center);
  assert.match(fuel.conselho.toLowerCase(), /proa|faixa/);
});

test("flood window overrides fuel cut", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 1100,
    hsM: 1.2,
    periodS: 7,
    windKn: 10,
    headingDeg: 300,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "popa" },
    currentRpm: 1100,
    headingDeg: 300,
    windKn: 12,
    windDir: 130,
    currentKn: 0.6,
    currentDir: 280,
    floodAdvice: "Suba o SOG pra pegar a enchente.",
  });
  assert.ok(fuel.rpmSugerido >= advice.center);
  assert.match(fuel.conselho.toLowerCase(), /enchente/);
});

/* ===========================================================================
 * Declividade de onda — correção do erro dimensional
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.1.0 · 2026-09-20
 *
 * A 1.0.0 usava `Hs/T`, que tem unidade de m/s. Declividade é adimensional:
 * Hs/L, com L = g·T²/(2π) em águas profundas. Escala com 1/T², não com 1/T.
 * ========================================================================= */

test("a declividade é adimensional e bate com Hs/L de águas profundas", () => {
  // Referência independente: L = g·T²/(2π), com g = 9,80665 m/s².
  const L = (T: number) => (9.80665 / (2 * Math.PI)) * T * T;
  for (const [hs, T] of [
    [1.5, 8],
    [1.0, 6],
    [2.0, 10],
    [0.6, 5],
  ] as const) {
    const esperado = hs / L(T);
    const veio = waveSteepness(hs, T);
    assert.ok(
      Math.abs(veio - esperado) / esperado < 1e-9,
      `Hs ${hs} T ${T}: esperado ${esperado}, veio ${veio}`,
    );
  }
  // Ordem de grandeza sadia: um mar costeiro típico fica perto de 1,5 %.
  const tipico = waveSteepness(1.5, 8);
  assert.ok(tipico > 0.014 && tipico < 0.016, `declividade típica ${tipico}`);
});

test("a declividade cai com o QUADRADO do período, não com o período", () => {
  // Este é o teste que separa a fórmula certa da errada. Dobrando T, a
  // declividade tem de cair 4×. Com o `Hs/T` antigo cairia só 2×.
  const a = waveSteepness(1.0, 5);
  const b = waveSteepness(1.0, 10);
  assert.ok(Math.abs(a / b - 4) < 1e-9, `razão ${a / b} deveria ser 4, não 2`);
});

test("o teto de declividade segura leitura suja", () => {
  // Um espectro real raramente passa de 0,05; acima disso é ruído.
  assert.ok(waveSteepness(30, 3) <= 0.05);
  assert.equal(waveSteepness(0, 8), 0);
  assert.equal(waveSteepness(1.5, 0), waveSteepness(1.5, 7.5), "sem Tz assume 7,5 s");
  assert.equal(waveSteepness(-1, 8), 0);
});

test("swell longo e vaga curta de mesma altura não pagam o mesmo pedágio", () => {
  // É a razão de existir da correção: 2 m em 14 s embala o rebocador;
  // 2 m em 6 s martela. A faixa de RPM tem de distinguir os dois.
  const base = {
    profile: DEFAULT_PROFILE,
    currentRpm: 950,
    hsM: 2.0,
    windKn: 10,
    headingDeg: null,
    waveDirDeg: null,
  };
  const vagaCurta = recommendRpm({ ...base, periodS: 6 });
  const swellLongo = recommendRpm({ ...base, periodS: 14 });

  assert.ok(
    vagaCurta.seaPenalty > swellLongo.seaPenalty,
    `vaga curta ${vagaCurta.seaPenalty} deveria punir mais que swell ${swellLongo.seaPenalty}`,
  );
  // E a diferença tem de ser material, não decorativa.
  assert.ok(
    vagaCurta.seaPenalty - swellLongo.seaPenalty > 50,
    `diferença de só ${vagaCurta.seaPenalty - swellLongo.seaPenalty} rpm não distingue nada`,
  );
  assert.ok(vagaCurta.center < swellLongo.center, "a vaga curta tem de derrubar mais o RPM");
});

test("no ponto de calibração o modelo não mudou de temperamento", () => {
  // Hs 1,5 m em 8 s é a viagem costeira típica. A penalidade de declividade
  // aqui foi calibrada para casar com a da 1.0.0 (0,1875 × 420 ≈ 78,8 rpm),
  // de modo que só a resposta ao período mudou, não a agressividade geral.
  const penalidadeDeclividade = waveSteepness(1.5, 8) * 5250;
  assert.ok(
    Math.abs(penalidadeDeclividade - 78.75) < 2,
    `penalidade ${penalidadeDeclividade} saiu do ponto de calibração`,
  );
});

test("a faixa de RPM continua dentro dos limites do motor", () => {
  // Guarda contra a recalibração empurrar o centro para fora do envelope.
  for (const hsM of [0, 0.5, 1.5, 3, 6, 8]) {
    for (const periodS of [0, 4, 8, 14]) {
      const a = recommendRpm({
        profile: DEFAULT_PROFILE,
        currentRpm: 950,
        hsM,
        periodS,
        windKn: 25,
        headingDeg: 40,
        waveDirDeg: 220,
      });
      assert.ok(
        a.min >= DEFAULT_PROFILE.idle && a.max <= DEFAULT_PROFILE.max,
        `Hs ${hsM} T ${periodS}: faixa ${a.min}–${a.max} fora do motor`,
      );
      assert.ok(a.max > a.min, `Hs ${hsM} T ${periodS}: faixa invertida`);
      assert.ok(a.center >= a.min && a.center <= a.max, "centro fora da própria faixa");
    }
  }
});

/* ===========================================================================
 * Resistência adicionada em ondas — STAWAVE-1
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.6.0 · 2026-09-20
 *
 * R_AWL = (1/16)·ρ·g·Hs²·B·√(B/L_BWL)  — ISO 15016 / ITTC 7.5-02-07-02.2
 * ========================================================================= */

test("a resistência bate com a fórmula da publicação", () => {
  // Referência independente, recalculada aqui a partir do enunciado.
  const ref = (hs: number, B: number, L: number) =>
    (1 / 16) * 1025 * 9.80665 * hs * hs * B * Math.sqrt(B / L);
  for (const [hs, B, L] of [
    [1.5, 11.5, 7],
    [2.0, 9.0, 5],
    [0.8, 14.0, 9],
  ] as const) {
    const esperado = ref(hs, B, L);
    const veio = addedResistanceN(hs, { beamM: B, bowLengthM: L });
    assert.ok(Math.abs(veio - esperado) / esperado < 1e-9, `Hs ${hs} B ${B}: ${veio}`);
  }
  // Ordem de grandeza sadia: ~21 kN num rebocador de porto em Hs 1,5 m.
  const kn = addedResistanceKn(1.5, DEFAULT_HULL);
  assert.ok(kn > 19 && kn < 23, `${kn} kN fora da ordem esperada`);
});

test("dobrar a altura QUADRUPLICA a resistência — é o ponto de toda a mudança", () => {
  // A 1.2.0 dobrava. Este teste é o que impede a volta do modelo linear.
  const a = addedResistanceN(1.0, DEFAULT_HULL);
  const b = addedResistanceN(2.0, DEFAULT_HULL);
  assert.ok(Math.abs(b / a - 4) < 1e-9, `razão ${b / a} deveria ser 4, não 2`);
});

test("casco mais boçudo sente mais o mesmo mar", () => {
  // B·√(B/L_BWL): a boca pesa mais que linearmente.
  const estreito = addedResistanceN(1.5, { beamM: 9, bowLengthM: 7 });
  const largo = addedResistanceN(1.5, { beamM: 13, bowLengthM: 7 });
  assert.ok(largo > estreito * 1.5, `${largo} vs ${estreito}: a boca tem de pesar`);
});

test("proa curta paga mais que proa fina, com a mesma boca", () => {
  // √(B/L_BWL) cresce quando a proa encurta — a assinatura do ASD.
  const proaCurta = addedResistanceN(1.5, { beamM: 11.5, bowLengthM: 5 });
  const proaLonga = addedResistanceN(1.5, { beamM: 11.5, bowLengthM: 10 });
  assert.ok(proaCurta > proaLonga, "proa curta e cheia martela mais");
});

test("casco inválido devolve zero em vez de NaN", () => {
  // Boca zero faria a raiz explodir e contaminaria a faixa inteira de RPM.
  for (const h of [
    { beamM: 0, bowLengthM: 7 },
    { beamM: 11.5, bowLengthM: 0 },
    { beamM: -1, bowLengthM: 7 },
  ]) {
    assert.equal(addedResistanceN(1.5, h), 0, JSON.stringify(h));
  }
  assert.equal(addedResistanceN(0, DEFAULT_HULL), 0);
  assert.equal(addedResistanceN(-2, DEFAULT_HULL), 0);
});

test("no ponto de calibração a faixa não mudou face à 1.2.0", () => {
  // Hs 1,5 m e T 8 s continuam devolvendo a mesma penalidade de mar de antes
  // (117 de altura + 79 de declividade ≈ 196 rpm). O que mudou é a curva.
  const a = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 900,
    hsM: 1.5,
    periodS: 8,
    windKn: 0,
    headingDeg: null,
    waveDirDeg: null,
  });
  assert.ok(
    Math.abs(a.seaPenalty - 196) < 6,
    `penalidade ${a.seaPenalty} saiu do ponto de calibração`,
  );
});

test("mar fraco alivia e mar grosso aperta, comparado ao modelo linear", () => {
  const faixa = (hsM: number) =>
    recommendRpm({
      profile: DEFAULT_PROFILE,
      currentRpm: 900,
      hsM,
      periodS: 8,
      windKn: 0,
      headingDeg: null,
      waveDirDeg: null,
    });
  // Em Hs 0,5 m o termo linear antigo cobrava 39 rpm de altura; agora ~13.
  assert.ok(faixa(0.5).seaPenalty < 39 + 30, `Hs 0,5: ${faixa(0.5).seaPenalty}`);
  // Em Hs 3 m cobrava 234; agora a altura sozinha passa de 400.
  assert.ok(faixa(3).seaPenalty > 400, `Hs 3,0: ${faixa(3).seaPenalty}`);
  // E a curva é monotônica.
  let anterior = -1;
  for (const hs of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
    const p = faixa(hs).seaPenalty;
    assert.ok(p >= anterior, `Hs ${hs} devolveu ${p}, menor que o anterior`);
    anterior = p;
  }
});

test("a resistência adicionada chega ao passadiço junto com a faixa", () => {
  const a = recommendRpm({
    profile: DEFAULT_PROFILE,
    hull: DEFAULT_HULL,
    currentRpm: 900,
    hsM: 1.5,
    periodS: 8,
    windKn: 0,
    headingDeg: null,
    waveDirDeg: null,
  });
  assert.ok(a.addedResistanceKn > 19 && a.addedResistanceKn < 23, `${a.addedResistanceKn} kN`);
  assert.equal(recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 900,
    hsM: 0,
    periodS: 0,
    windKn: 0,
    headingDeg: null,
    waveDirDeg: null,
  }).addedResistanceKn, 0, "mar parado não adiciona resistência");
});

test("mesmo em mar extremo a faixa respeita o envelope do motor", () => {
  for (const hsM of [4, 6, 8]) {
    const a = recommendRpm({
      profile: DEFAULT_PROFILE,
      currentRpm: 900,
      hsM,
      periodS: 6,
      windKn: 40,
      headingDeg: 0,
      waveDirDeg: 180,
    });
    assert.ok(a.min >= DEFAULT_PROFILE.idle, `Hs ${hsM}: min ${a.min}`);
    assert.ok(a.max <= DEFAULT_PROFILE.max, `Hs ${hsM}: max ${a.max}`);
    assert.ok(a.center >= a.min && a.center <= a.max);
  }
});
