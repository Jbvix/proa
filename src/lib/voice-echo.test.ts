/**
 * Proa · TugLife Systems — Testes da guarda de eco
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.4.0 · 2026-09-20 02:14 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoMemory } from "./voice-echo.ts";

test("memória vazia não acusa eco de uma pergunta comum", () => {
  const m = createEchoMemory();
  assert.equal(m.last(), null);
  assert.equal(m.previous(), null);
  assert.equal(m.isEcho("quanto falta pro destino"), false);
});

test("há frases que são eco pelo conteúdo, com ou sem memória", () => {
  // `isAlanaEcho` guarda também um conjunto de bordões que só a Lara diz —
  // "passando X", "chegando em X", "abriu demais da derrota". Se o microfone
  // devolve uma dessas, é o alto-falante e não a tripulação, mesmo com a memória
  // vazia (logo após um reset, por exemplo, ou um recarregamento da página).
  const m = createEchoMemory();
  assert.equal(m.isEcho("passando o Mucuripe"), true);
  assert.equal(m.isEcho("chegando em Pecém"), true);
});

test("o microfone captando a própria fala é reconhecido como eco", () => {
  const m = createEchoMemory();
  m.remember("Passando Mucuripe. Faltam 12 milhas.");
  assert.equal(m.isEcho("passando mucuripe faltam 12 milhas"), true);
});

test("guarda DUAS falas, porque a transcrição chega atrasada", () => {
  // Enquanto o eco da frase N ainda viaja pela cadeia de áudio, a Lara já pode
  // ter dito a N+1. Com memória de uma só, o eco atrasado viraria pergunta.
  const m = createEchoMemory();
  m.remember("Maré enchente até as nove e vinte.");
  m.remember("Vento quatorze nós de leste.");
  assert.equal(m.isEcho("vento quatorze nos de leste"), true, "a última");
  assert.equal(m.isEcho("mare enchente ate as nove e vinte"), true, "a penúltima");
});

test("a terceira fala atrás sai da memória", () => {
  // Guardar mais aumentaria a chance de recusar pergunta legítima que por acaso
  // repita uma frase antiga. As três aqui não compartilham vocabulário, senão a
  // semelhança por si só casaria todas.
  const m = createEchoMemory();
  m.remember("Maré enchente até as nove e vinte.");
  m.remember("Vento quatorze nós de leste.");
  m.remember("Faixa ideal entre novecentos e mil.");
  assert.equal(m.isEcho("mare enchente ate as nove e vinte"), false, "caiu da memória");
  assert.equal(m.isEcho("vento quatorze nos de leste"), true, "penúltima");
  assert.equal(m.isEcho("faixa ideal entre novecentos e mil"), true, "última");
});

test("pergunta de verdade da tripulação passa pela peneira", () => {
  const m = createEchoMemory();
  m.remember("Passando Mucuripe. Faltam 12 milhas.");
  assert.equal(m.isEcho("qual a maré agora"), false);
  assert.equal(m.isEcho("me dá um relatório da viagem"), false);
});

test("reset limpa as duas falas", () => {
  const m = createEchoMemory();
  m.remember("Maré enchente até as nove e vinte.");
  m.remember("Vento quatorze nós de leste.");
  m.reset();
  assert.equal(m.last(), null);
  assert.equal(m.previous(), null);
  assert.equal(m.isEcho("vento quatorze nos de leste"), false);
});

test("last e previous andam na ordem certa", () => {
  const m = createEchoMemory();
  m.remember("um");
  assert.equal(m.last(), "um");
  assert.equal(m.previous(), null);
  m.remember("dois");
  assert.equal(m.last(), "dois");
  assert.equal(m.previous(), "um");
});
