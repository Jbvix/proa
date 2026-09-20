/**
 * Proa · TugLife Systems — Testes da política do microfone
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.15.0 · 2026-09-20 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { micLabel, micPolicy } from "./voice-mic.ts";

test("padrão de fábrica: Lara ligada, conversa fechada, ajuste desligado → microfone FECHADO", () => {
  // A regra que se explica numa frase: microfone aberto só com a conversa.
  assert.equal(micPolicy({ muted: false, talkOn: false, wakeWord: false }), "closed");
});

test("conversa aberta abre o microfone, com ou sem o ajuste", () => {
  assert.equal(micPolicy({ muted: false, talkOn: true, wakeWord: false }), "talk");
  assert.equal(micPolicy({ muted: false, talkOn: true, wakeWord: true }), "talk");
});

test("escuta pelo nome ligada: conversa fechada mantém o microfone aberto, à espera do nome", () => {
  assert.equal(micPolicy({ muted: false, talkOn: false, wakeWord: true }), "wake");
});

test("Lara desligada fecha tudo, mesmo com conversa e ajuste ligados", () => {
  assert.equal(micPolicy({ muted: true, talkOn: true, wakeWord: true }), "closed");
});

test("os rótulos dizem o que o indicador do Android vai mostrar", () => {
  assert.match(micLabel("closed"), /fechado/);
  assert.match(micLabel("wake"), /aberto/);
  assert.equal(micLabel("talk"), "conversa");
});
