/**
 * Proa · TugLife Systems — Testes da consulta ao atlas
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.17.0 · 2026-09-21 12:00 UTC (ano 2026)
 *
 * As referências são LEITURAS A OLHO da carta, feitas antes do extrator
 * existir: janeiro e julho ao largo do Ceará. Se o extrator mudar e a rosa
 * do Ceará deixar de dizer "leste 54 %, força 3", este teste acusa — e a
 * legenda da própria carta usa essa rosa como exemplo.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATLAS_LICENCA,
  atlasMonth,
  atlasSummary,
  nearestCurrent,
  nearestRose,
  rankedOctants,
} from "./atlas.ts";

const FORTALEZA = { lat: -3.72, lon: -38.52 };

test("o dado carrega com fonte, licença educativa e 12 meses", () => {
  assert.match(ATLAS_LICENCA, /EDUCATIVA/);
  for (let m = 1; m <= 12; m++) {
    const mes = atlasMonth(m);
    assert.equal(mes.mes, m);
    assert.ok(mes.rosas.length >= 40, `${mes.nome}: ${mes.rosas.length} rosas`);
    assert.ok(mes.correntes.length >= 50, `${mes.nome}: ${mes.correntes.length} correntes`);
    assert.ok(mes.nevoeiro.length >= 50 && mes.ventoForte.length >= 40, `${mes.nome}: verso`);
  }
  assert.throws(() => atlasMonth(13));
});

test("cada rosa fecha a conta: octantes + calmaria entre 85 e 115 % na grande maioria", () => {
  // A soma é a conferência embutida do extrator. Aceita-se uma pequena
  // fração fora — rótulo perdido ou haste truncada — mas nunca a maioria.
  let fora = 0;
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    for (const r of atlasMonth(m).rosas) {
      total += 1;
      if (r.soma < 85 || r.soma > 115) fora += 1;
      for (const o of Object.values(r.oct)) {
        assert.ok(o.pct >= 0 && o.pct <= 100);
        assert.ok(o.bf == null || (o.bf >= 1 && o.bf <= 8), `força ${o.bf}`);
      }
    }
  }
  assert.ok(fora / total < 0.03, `${fora} de ${total} rosas fora da faixa`);
});

test("janeiro ao largo do Ceará: leste 54 % força 3, sudeste 29 % força 3, nordeste ~8 %", () => {
  // O exemplo impresso na legenda da carta é esta rosa.
  const r = nearestRose(FORTALEZA.lat, FORTALEZA.lon, 1);
  assert.ok(r && r.nm < 120, `rosa a ${r?.nm} mn`);
  const ranked = rankedOctants(r!.item);
  assert.equal(ranked[0].oct, "E");
  assert.equal(ranked[0].pct, 54);
  assert.equal(ranked[0].bf, 3);
  assert.equal(ranked[1].oct, "SE");
  assert.equal(ranked[1].pct, 29);
  const ne = r!.item.oct.NE!;
  assert.ok(Math.abs(ne.pct - 8) <= 1, `NE ${ne.pct}`);
});

test("julho ao largo do Ceará: sudeste 58 % força 4, leste 26 % força 4 — o alísio mudou de quadrante", () => {
  const r = nearestRose(FORTALEZA.lat, FORTALEZA.lon, 7);
  const ranked = rankedOctants(r!.item);
  assert.equal(ranked[0].oct, "SE");
  assert.equal(ranked[0].pct, 58);
  assert.equal(ranked[0].bf, 4);
  assert.equal(ranked[1].oct, "E");
  assert.equal(ranked[1].pct, 26);
});

test("corrente costeira do Ceará em janeiro corre para oeste-noroeste a 2 nós", () => {
  const c = nearestCurrent(FORTALEZA.lat, FORTALEZA.lon, 1);
  assert.ok(c, "sem corrente no alcance");
  assert.ok(c!.item.dir >= 260 && c!.item.dir <= 320, `dir ${c!.item.dir}`);
  assert.equal(c!.item.kn, 2.0);
});

test("o resumo diz 'climatologia', o mês, a distância e a corrente", () => {
  const s = atlasSummary(FORTALEZA.lat, FORTALEZA.lon, 1);
  assert.match(s.texto, /^Climatologia de janeiro \(rosa a \d+ milhas\): vento de leste 54 %, força 3, depois sudeste 29 %, força 3\./);
  assert.match(s.texto, /Corrente para (oeste|noroeste) a 2\.0 nós \(seta a \d+ milhas\)\./);
  assert.equal(s.corrente?.kn, 2);
});

test("fora da carta o resumo diz que não cobre, sem inventar", () => {
  const s = atlasSummary(45, -30, 6);
  assert.match(s.texto, /não cobre/);
  assert.equal(s.rosa, null);
  assert.equal(s.corrente, null);
});
