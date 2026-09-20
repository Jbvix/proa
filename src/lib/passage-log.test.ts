/**
 * Proa · TugLife Systems — Testes do diário de travessia
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.12.0 · 2026-09-20 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ctx } from "./voice-context.fixture.ts";
import {
  CSV_COLUMNS,
  LOG_MAX,
  appendLogEntry,
  csvFilename,
  logToCsv,
  makeLogEntry,
} from "./passage-log.ts";

const T = 1_790_000_000_000; // uma hora cheia qualquer

test("a linha da hora traz os pares que a calibração precisa", () => {
  const e = makeLogEntry(ctx(), T, "1.12.0");
  assert.equal(e.t, T);
  assert.equal(e.versao, "1.12.0");
  assert.equal(e.singradura, true);
  // Hs medido × previsto, RPM × SOG, vento e corrente com direção, rumo.
  assert.equal(e.hsObsM, 0.83);
  assert.equal(e.hsPrevM, 1.12);
  assert.equal(e.rpm, 920);
  assert.equal(e.sogKn, 7.2);
  assert.equal(e.ventoKn, 12.3);
  assert.equal(e.ventoDirDeg, 80);
  assert.equal(e.correnteKn, 0.62);
  assert.equal(e.correnteDirDeg, 300);
  assert.equal(e.rumoDeg, 310);
  // Posição com 4 casas (≈ 11 m), não a precisão falsa do GPS.
  assert.equal(e.lat, -3.7123);
  assert.equal(e.lon, -38.5432);
  // Próximo waypoint: o primeiro com mais de 0,4 mn à frente, não o colado.
  assert.equal(e.proximoWp, "WP meio");
  assert.equal(e.proximoWpNm, 8);
  assert.equal(e.eta, "hoje 18:10");
});

test("sem captura, o Hs do casco vai nulo — não zero", () => {
  // Gravar zero seria dizer que o mar estava chão. Nulo diz "não medi".
  const e = makeLogEntry(ctx({ captura: false }), T, "1.12.0");
  assert.equal(e.hsObsM, null);
  assert.equal(e.tzObsS, null);
  assert.equal(e.estadoMar, null);
  // A previsão continua: ela não depende do sensor.
  assert.equal(e.hsPrevM, 1.12);
});

test("medida não confiável também vai nula", () => {
  const base = ctx();
  const e = makeLogEntry(ctx({ mar: { ...base.mar, confiavel: false } }), T, "1.12.0");
  assert.equal(e.hsObsM, null);
});

test("atracado: linha gravada, singradura falsa", () => {
  const base = ctx();
  const e = makeLogEntry(ctx({ posicao: { ...base.posicao, sogKn: 0.2 } }), T, "1.12.0");
  assert.equal(e.singradura, false);
  assert.equal(e.sogKn, 0.2);
});

test("NaN e Infinity não entram no diário", () => {
  const base = ctx();
  const e = makeLogEntry(
    ctx({ posicao: { ...base.posicao, sogKn: Number.NaN, rumoDeg: Number.POSITIVE_INFINITY } }),
    T,
    "1.12.0",
  );
  assert.equal(e.sogKn, null);
  assert.equal(e.rumoDeg, null);
  assert.equal(e.singradura, false);
});

test("mesma hora gravada duas vezes: a segunda substitui; ordem por tempo", () => {
  const a = makeLogEntry(ctx(), T, "1.12.0");
  const b = makeLogEntry(ctx({ rpm: { ...ctx().rpm, atual: 950 } }), T, "1.12.0");
  const c = makeLogEntry(ctx(), T - 3_600_000, "1.12.0");
  const log = appendLogEntry(appendLogEntry(appendLogEntry([], a), b), c);
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((e) => e.t), [T - 3_600_000, T]);
  assert.equal(log[1].rpm, 950);
});

test("o diário guarda 14 dias e solta a hora mais antiga", () => {
  let log: ReturnType<typeof makeLogEntry>[] = [];
  for (let i = 0; i < LOG_MAX + 5; i++) {
    log = appendLogEntry(log, makeLogEntry(ctx(), T + i * 3_600_000, "1.12.0"));
  }
  assert.equal(log.length, LOG_MAX);
  assert.equal(log[0].t, T + 5 * 3_600_000);
});

test("CSV: cabeçalho na ordem do contrato, ponto decimal, CRLF, aspas onde precisa", () => {
  const e = makeLogEntry(ctx({ agora: 'sábado, 20 set "14:00"' }), T, "1.12.0");
  const csv = logToCsv([e]);
  const linhas = csv.split("\r\n");
  assert.equal(linhas[0], CSV_COLUMNS.join(","));
  assert.equal(linhas.length, 3, "cabeçalho + 1 linha + CRLF final");
  // Começo da linha, na ordem do contrato: t, agora, versao, singradura.
  // `agora` tem vírgula e aspas: vai entre aspas, com as aspas dobradas — e
  // é por isso que a linha não se confere com `split(",")`.
  assert.match(linhas[1], new RegExp(`^${T},"sábado, 20 set ""14:00""",1\\.12\\.0,1,`));
  // Nulo vira vazio: `xteLado` não é coluna, mas `estadoMar` nulo seria ",,".
  const semMedida = logToCsv([makeLogEntry(ctx({ captura: false }), T, "1.12.0")]);
  assert.match(semMedida, /,,,/);
  // Ponto decimal, não vírgula: é o que a regressão vai ler.
  assert.match(csv, /,0\.83,1\.12,/);
});

test("CSV de diário vazio é só o cabeçalho", () => {
  assert.equal(logToCsv([]), CSV_COLUMNS.join(",") + "\r\n");
});

test("nome do arquivo leva data e hora locais", () => {
  const d = new Date(2026, 8, 20, 14, 5);
  assert.equal(csvFilename(d), "proa-diario-20260920-1405.csv");
});
