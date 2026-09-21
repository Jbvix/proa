/**
 * Proa · TugLife Systems — Testes da escala Beaufort
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.16.0 · 2026-09-21 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAUFORT, beaufortFromKn, beaufortRow, expectedHsFromWindKn } from "./beaufort.ts";

test("a tabela cobre 0 a 12 sem buraco nem sobreposição nos nós", () => {
  assert.equal(BEAUFORT.length, 13);
  for (let i = 1; i < BEAUFORT.length; i++) {
    const a = BEAUFORT[i - 1];
    const b = BEAUFORT[i];
    assert.equal(b.force, a.force + 1);
    assert.ok(b.minKn > a.maxKn, `força ${b.force} começa antes de a ${a.force} acabar`);
    assert.ok(b.minKn - a.maxKn <= 1.01, `buraco entre ${a.force} e ${b.force}`);
  }
});

test("as faixas da carta da DHN: 7–10 é 3, 11–16 é 4, 17–21 é 5, 64+ é 12", () => {
  assert.equal(beaufortFromKn(0.5), 0);
  assert.equal(beaufortFromKn(2), 1);
  assert.equal(beaufortFromKn(7), 3);
  assert.equal(beaufortFromKn(10), 3);
  assert.equal(beaufortFromKn(11), 4);
  assert.equal(beaufortFromKn(16), 4);
  assert.equal(beaufortFromKn(17), 5);
  assert.equal(beaufortFromKn(33), 7);
  assert.equal(beaufortFromKn(64), 12);
  assert.equal(beaufortFromKn(90), 12);
});

test("fronteira fracionária arredonda como o observador: 10,5 nós é força 4", () => {
  assert.equal(beaufortFromKn(10.4), 3);
  assert.equal(beaufortFromKn(10.5), 4);
});

test("vento inválido não tem força", () => {
  assert.equal(beaufortFromKn(null), null);
  assert.equal(beaufortFromKn(Number.NaN), null);
  assert.equal(beaufortFromKn(-3), null);
});

test("nome e altura como na carta", () => {
  assert.equal(beaufortRow(3)?.nome, "Fraco");
  assert.equal(beaufortRow(3)?.alturaM, 0.6);
  assert.equal(beaufortRow(4)?.alturaM, 1.5);
  assert.equal(beaufortRow(5)?.alturaM, 2.4);
  assert.equal(beaufortRow(12)?.alturaM, null);
  assert.equal(beaufortRow(13), null);
});

test("Hs esperado pro vento: interpola entre os centros das faixas, sem degrau", () => {
  // Centro da força 3 = 8,5 nós → 0,6 m; centro da 4 = 13,5 → 1,5 m.
  assert.equal(expectedHsFromWindKn(8.5), 0.6);
  assert.equal(expectedHsFromWindKn(13.5), 1.5);
  const meio = expectedHsFromWindKn(11)!;
  assert.ok(meio > 0.6 && meio < 1.5, `${meio}`);
  // Monotônico: mais vento, mais mar.
  let prev = -1;
  for (let v = 0; v <= 70; v += 1) {
    const h = expectedHsFromWindKn(v)!;
    assert.ok(h >= prev, `caiu em ${v} nós`);
    prev = h;
  }
});

test("Hs esperado: calmaria é zero, e acima da força 11 trava em 14 m", () => {
  assert.equal(expectedHsFromWindKn(0), 0);
  // 1 nó fica entre o centro da calmaria (0,5 nó, 0 m) e o da bafagem (2 nós,
  // 0,1 m): centímetros, não zero exato — e é assim que deve ser.
  assert.ok(expectedHsFromWindKn(1)! < 0.1);
  assert.equal(expectedHsFromWindKn(80), 14);
  assert.equal(expectedHsFromWindKn(null), null);
  assert.equal(expectedHsFromWindKn(-1), null);
});

test("o caso do estudo Fortaleza–Pecém: F3 → 0,6 m, F4 → 1,5 m, 6× na resistência (∝ Hs²)", () => {
  const f3 = beaufortRow(3)!.alturaM!;
  const f4 = beaufortRow(4)!.alturaM!;
  assert.ok(Math.abs((f4 / f3) ** 2 - 6.25) < 0.01);
});
