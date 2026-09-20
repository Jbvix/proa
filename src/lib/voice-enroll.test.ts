/**
 * Proa · TugLife Systems — Testes do cadastro de nome com confirmação
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.14.0 · 2026-09-20 12:00 UTC (ano 2026)
 *
 * O caso "Tadala" está aqui, escrito: ruído depois de "Qual o seu nome?"
 * não pode mais virar tripulante sem que alguém diga "sim".
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENROLL_IDLE,
  NAME_CONFIRM_MS,
  confirmLine,
  isNo,
  isYes,
  routeEnroll,
} from "./voice-enroll.ts";

const PERGUNTOU = "Boa tarde. Sou a Lara, do passadiço. Qual o seu nome?";
const T = 100_000;

test("depois da pergunta, um candidato NÃO é gravado: vira pedido de confirmação", () => {
  const r = routeEnroll(ENROLL_IDLE, { text: "Tadala", nowMono: T, lastAssistant: PERGUNTOU });
  assert.deepEqual(r.action, { kind: "confirm", name: "Tadala" });
  assert.equal(r.state.pending, "Tadala");
  assert.equal(r.state.askedAt, T);
});

test("o sim grava; o pendente some", () => {
  const um = routeEnroll(ENROLL_IDLE, { text: "Jossian", nowMono: T, lastAssistant: PERGUNTOU });
  for (const sim of ["sim", "isso", "isso mesmo", "certo", "confirma", "positivo", "sim, Lara", "Isso aí."]) {
    const r = routeEnroll(um.state, { text: sim, nowMono: T + 3_000, lastAssistant: confirmLine("Jossian") });
    assert.deepEqual(r.action, { kind: "save", name: "Jossian" }, sim);
    assert.equal(r.state.pending, null);
  }
});

test("o não descarta com frase; o pendente some", () => {
  const um = routeEnroll(ENROLL_IDLE, { text: "Tadala", nowMono: T, lastAssistant: PERGUNTOU });
  for (const nao of ["não", "negativo", "errado", "não, Lara"]) {
    const r = routeEnroll(um.state, { text: nao, nowMono: T + 3_000 });
    assert.deepEqual(r.action, { kind: "discard" }, nao);
    assert.equal(r.state.pending, null);
  }
});

test("outra fala qualquer descarta em silêncio e segue o caminho normal", () => {
  // "Tadala" ficou pendente; a pessoa perguntou o vento em vez de confirmar.
  // Não grava, não fala nada sobre o nome, e a pergunta vai adiante.
  const um = routeEnroll(ENROLL_IDLE, { text: "Tadala", nowMono: T, lastAssistant: PERGUNTOU });
  const r = routeEnroll(um.state, { text: "e o vento como tá", nowMono: T + 3_000 });
  assert.deepEqual(r.action, { kind: "none" });
  assert.equal(r.state.pending, null);
});

test("sim depois de 20 s não vale: o pendente venceu", () => {
  const um = routeEnroll(ENROLL_IDLE, { text: "Jossian", nowMono: T, lastAssistant: PERGUNTOU });
  const r = routeEnroll(um.state, { text: "sim", nowMono: T + NAME_CONFIRM_MS + 1 });
  assert.notEqual(r.action.kind, "save");
  assert.equal(r.state.pending, null);
});

test("sim sem nada pendente é só uma palavra", () => {
  const r = routeEnroll(ENROLL_IDLE, { text: "sim", nowMono: T });
  assert.deepEqual(r.action, { kind: "none" });
});

test("apresentação explícita também pede confirmação — sem ela, não grava", () => {
  const r = routeEnroll(ENROLL_IDLE, { text: "meu nome é Jossian", nowMono: T });
  assert.deepEqual(r.action, { kind: "confirm", name: "Jossian" });
});

test("sem a pergunta do nome, palavra solta não é candidato", () => {
  // "Tadala" dito no meio de uma conversa qualquer não é apresentação.
  const r = routeEnroll(ENROLL_IDLE, { text: "Tadala", nowMono: T, lastAssistant: "Vento 12 nós de leste." });
  assert.deepEqual(r.action, { kind: "none" });
});

test("depois da pergunta, uma pergunta de verdade não vira nome", () => {
  const r = routeEnroll(ENROLL_IDLE, { text: "qual o vento", nowMono: T, lastAssistant: PERGUNTOU });
  assert.deepEqual(r.action, { kind: "none" });
});

test("sim e não: reconhecimento tolerante a acento, ponto e o nome dela no fim", () => {
  assert.equal(isYes("Sim."), true);
  assert.equal(isYes("isso mesmo, lara"), true);
  assert.equal(isYes("não"), false);
  assert.equal(isNo("Não."), true);
  assert.equal(isNo("negativo lara"), true);
  assert.equal(isNo("sim"), false);
  // Frase longa começando com "sim" não é confirmação: é outra coisa.
  assert.equal(isYes("sim mas quanto falta pro destino"), false);
});
