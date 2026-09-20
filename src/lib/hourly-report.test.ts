/**
 * Proa · TugLife Systems — Testes do relatório da hora cheia
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.12.0 · 2026-09-20 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hourlyReport } from "./hourly-report.ts";
import { makeLogEntry, type LogEntry } from "./passage-log.ts";
import { ctx } from "./voice-context.fixture.ts";

const T = Date.UTC(2026, 8, 20, 17, 0); // 14:00 em UTC−3; a hora exata não importa aqui

test("relatório completo: nome, hora, navegação, mar medido × previsto, vento, RPM, viagem, próximo, maré", () => {
  const txt = hourlyReport(makeLogEntry(ctx(), T, "1.12.0"), "Jossian");
  assert.match(txt, /^Jossian\. Relatório das \d\d:\d\d\./);
  assert.match(txt, /7\.2 nós, rumo 310\./);
  assert.match(txt, /Hs 0\.8 no casco, previsto 1\.1, Fraco\./);
  assert.match(txt, /Vento 12 nós de 80\./);
  assert.match(txt, /RPM 920, na faixa\./);
  assert.match(txt, /Faltam 30 milhas, ETA hoje 18:10\./);
  assert.match(txt, /Próximo: WP meio, 8\.0 milhas\./);
  assert.match(txt, /Maré enchente\./);
  // XTE de 0,04 mn é ruído de GPS: calada.
  assert.doesNotMatch(txt, /XTE/);
});

test("RPM fora da faixa: diz a faixa, que é o aviso", () => {
  const e = makeLogEntry(ctx({ rpm: { ...ctx().rpm, atual: 1050 } }), T, "1.12.0");
  assert.match(hourlyReport(e), /RPM 1050, faixa 880 a 980\./);
});

test("sem medida do casco, só a previsão; sem nenhuma, sem frase de mar", () => {
  const soPrev = makeLogEntry(ctx({ captura: false }), T, "1.12.0");
  assert.match(hourlyReport(soPrev), /Hs previsto 1\.1\./);
  const nada: LogEntry = { ...soPrev, hsPrevM: null };
  assert.doesNotMatch(hourlyReport(nada), /Hs/);
});

test("sem derrota: sem 'faltam', sem próximo, sem ETA", () => {
  const base = makeLogEntry(ctx(), T, "1.12.0");
  const e: LogEntry = { ...base, faltaNm: null, proximoWp: null, proximoWpNm: null, eta: null };
  const txt = hourlyReport(e);
  assert.doesNotMatch(txt, /Faltam|Próximo|ETA/);
  // O resto continua.
  assert.match(txt, /RPM 920/);
});

test("afastamento de verdade é dito", () => {
  const e: LogEntry = { ...makeLogEntry(ctx(), T, "1.12.0"), xteNm: 0.31 };
  assert.match(hourlyReport(e), /XTE 0\.31 milhas\./);
});

test("sem nome, começa direto no relatório", () => {
  assert.match(hourlyReport(makeLogEntry(ctx(), T, "1.12.0")), /^Relatório das/);
});

test("é fala de passadiço: cabe em quatro frases curtas por assunto, sem enfeite", () => {
  const txt = hourlyReport(makeLogEntry(ctx(), T, "1.12.0"), "Jossian");
  assert.ok(txt.length < 260, `longo demais: ${txt.length}`);
  assert.doesNotMatch(txt, /Um momento|deixa eu verificar|Lara/);
});
