/**
 * Proa · TugLife Systems — Testes da escolha da voz local
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.11.0 · 2026-09-20 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { localSpeechCapMs, pickLocalVoice } from "./voice-local.ts";

const v = (name: string, lang: string) => ({ name, lang });

test("lista vazia ou sem português: null, e o chamador vai à rede", () => {
  assert.equal(pickLocalVoice([]), null);
  assert.equal(
    pickLocalVoice([v("English US", "en-US"), v("Español", "es-ES")]),
    null,
  );
});

test("pt-BR ganha de pt-PT, mesmo vindo depois na lista", () => {
  const got = pickLocalVoice([
    v("Português (Portugal)", "pt-PT"),
    v("Português (Brasil)", "pt-BR"),
  ]);
  assert.equal(got?.lang, "pt-BR");
});

test("entre as pt-BR, a não compacta ganha", () => {
  const got = pickLocalVoice([
    v("pt-br-x-afs-compact", "pt-BR"),
    v("Google português do Brasil", "pt-BR"),
  ]);
  assert.equal(got?.name, "Google português do Brasil");
});

test("só compacta pt-BR: serve mesmo assim", () => {
  const got = pickLocalVoice([v("pt-br-x-afs-compact", "pt-BR"), v("English", "en-GB")]);
  assert.equal(got?.name, "pt-br-x-afs-compact");
});

test("só pt-PT: é o que tem", () => {
  const got = pickLocalVoice([v("Joana", "pt-PT"), v("English", "en-US")]);
  assert.equal(got?.name, "Joana");
});

test("aceita 'pt_BR' com sublinhado e 'pt' seco", () => {
  assert.equal(pickLocalVoice([v("x", "pt_BR")])?.lang, "pt_BR");
  assert.equal(pickLocalVoice([v("y", "pt")])?.lang, "pt");
  // "ptx" não é português.
  assert.equal(pickLocalVoice([v("z", "ptx-XX")]), null);
});

test("teto de duração cresce com o texto e tem tampa", () => {
  assert.equal(localSpeechCapMs(""), 1_500);
  assert.equal(localSpeechCapMs("SOG de 7 nós."), 1_500 + 13 * 70);
  assert.equal(localSpeechCapMs("a".repeat(10_000)), 30_000);
});
