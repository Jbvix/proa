/**
 * Proa · TugLife Systems — Testes do boletim de climatologia
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.18.0 · 2026-09-21 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { climatologyCell, climatologyMeteo, knFromBeaufort } from "./meteo-clima.ts";

const JAN = Date.UTC(2026, 0, 15, 12);
const JUL = Date.UTC(2026, 6, 15, 12);
const FORTALEZA = { lat: -3.72, lon: -38.52 };

test("nós pelo meio da faixa Beaufort: F3 → 8,5; F4 → 13,5; desconhecida → F4", () => {
  assert.equal(knFromBeaufort(3), 8.5);
  assert.equal(knFromBeaufort(4), 13.5);
  assert.equal(knFromBeaufort(null), 13.5);
  assert.equal(knFromBeaufort(12), 14);
});

test("Ceará em janeiro: vento de leste força 3, Hs 0,6 m, corrente 2 nós para oeste-noroeste", () => {
  const c = climatologyCell(FORTALEZA.lat, FORTALEZA.lon, 1)!;
  assert.equal(c.windDir, 90);
  assert.equal(c.windKn, 8.5);
  assert.equal(c.waveHs, 0.6);
  assert.equal(c.currentKn, 2);
  assert.ok(c.currentDir != null && c.currentDir >= 260 && c.currentDir <= 320);
});

test("Ceará em julho: sudeste força 4 — o boletim muda com o mês, o sintético não mudava", () => {
  const c = climatologyCell(FORTALEZA.lat, FORTALEZA.lon, 7)!;
  assert.equal(c.windDir, 135);
  assert.equal(c.windKn, 13.5);
  assert.equal(c.waveHs, 1.5);
});

test("o boletim leva plano 'climatologia', 24 horas planas e nulos onde o atlas não dá número", () => {
  const b = climatologyMeteo(FORTALEZA.lat, FORTALEZA.lon, JAN, [
    { lat: -3.72, lon: -38.52, label: "Fortaleza", distNm: 0 },
    { lat: -3.55, lon: -38.8, label: "Pecém", distNm: 20 },
  ])!;
  assert.equal(b.plano, "climatologia");
  assert.equal(b.hourly.length, 24);
  assert.ok(b.hourly.every((h) => h.windKn === b.now.windKn && h.windDir === b.now.windDir));
  assert.equal(b.now.tempC, null);
  assert.equal(b.now.pressureHpa, null);
  assert.equal(b.now.wavePeriod, null);
  assert.equal(b.now.weatherCode, null);
  assert.equal(b.alongRoute.length, 2);
  assert.equal(b.alongRoute[1].label, "Pecém");
  assert.equal(b.alongRoute[1].waveHs, 0.6);
  assert.ok(b.tideHours.length > 0);
});

test("fora da cobertura do atlas: null, não um número bonito", () => {
  assert.equal(climatologyMeteo(45, -30, JUL), null);
  assert.equal(climatologyCell(-50, -60, 1), null);
});
