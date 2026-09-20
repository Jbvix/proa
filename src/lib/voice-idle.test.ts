/**
 * Proa · TugLife Systems — Testes da validade do turno de conversa
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.10.0 · 2026-09-20 12:00 UTC (ano 2026)
 *
 * O contrato que o componente depende: três fases, fronteiras exatas, e
 * contagem que se mostra em segundos inteiros. Se alguém trocar os 90 s por
 * outro valor, é aqui que a decisão fica registrada.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TALK_IDLE_MS, TALK_WARN_MS, talkIdle } from "./voice-idle.ts";

test("recém-aberta: fase aberta, prazo cheio", () => {
  const r = talkIdle(1000, 1000);
  assert.equal(r.phase, "aberta");
  assert.equal(r.remainingMs, TALK_IDLE_MS);
  assert.equal(r.remainingS, 90);
});

test("um pouco antes do aviso ainda é aberta; no aviso vira encerrando", () => {
  // A fronteira é inclusiva no lado de "encerrando": aos 15 s exatos já se
  // mostra a contagem, porque mostrar 15 e não mostrar 15 tem de ser uma
  // decisão só.
  const t0 = 5000;
  const antes = talkIdle(t0, t0 + TALK_IDLE_MS - TALK_WARN_MS - 1);
  assert.equal(antes.phase, "aberta");
  const no = talkIdle(t0, t0 + TALK_IDLE_MS - TALK_WARN_MS);
  assert.equal(no.phase, "encerrando");
  assert.equal(no.remainingS, 15);
});

test("contagem cai de 15 a 1 em segundos inteiros, arredondando para cima", () => {
  // 14,2 s restantes → mostra 15; 0,3 s → mostra 1. Nunca mostra 0 com a
  // conversa ainda aberta: zero é a fase "expirou", não um número na tela.
  const t0 = 0;
  assert.equal(talkIdle(t0, TALK_IDLE_MS - 14_200).remainingS, 15);
  assert.equal(talkIdle(t0, TALK_IDLE_MS - 1_000).remainingS, 1);
  assert.equal(talkIdle(t0, TALK_IDLE_MS - 300).remainingS, 1);
});

test("no prazo exato expira, e daí em diante o restante é zero", () => {
  const t0 = 42;
  const no = talkIdle(t0, t0 + TALK_IDLE_MS);
  assert.equal(no.phase, "expirou");
  assert.equal(no.remainingMs, 0);
  assert.equal(no.remainingS, 0);
  const depois = talkIdle(t0, t0 + TALK_IDLE_MS + 600_000);
  assert.equal(depois.phase, "expirou");
  assert.equal(depois.remainingMs, 0);
});

test("relógio no passado (atividade 'no futuro') conta como zero decorrido", () => {
  // Defesa contra um `performance.now()` lido antes da atividade ser marcada:
  // não pode dar prazo maior que o cheio.
  const r = talkIdle(10_000, 9_000);
  assert.equal(r.phase, "aberta");
  assert.equal(r.remainingMs, TALK_IDLE_MS);
});

test("as constantes têm a proporção que o manual documenta", () => {
  // 90 s de prazo, aviso nos últimos 15 s. O manual e o GDD dizem esses
  // números; se mudarem aqui, mudam lá.
  assert.equal(TALK_IDLE_MS, 90_000);
  assert.equal(TALK_WARN_MS, 15_000);
  assert.ok(TALK_WARN_MS < TALK_IDLE_MS);
});
