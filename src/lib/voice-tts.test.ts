/**
 * Proa · TugLife Systems — Testes do cache de fala
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.4.0 · 2026-09-20 02:14 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  TTS_CACHE_KEYS,
  TTS_MIN_B64,
  readTtsCache,
  writeTtsCache,
} from "./voice-tts.ts";

const AUDIO = "Q".repeat(TTS_MIN_B64 + 40);

/** `localStorage` de mentira: o Node não tem um, e o módulo espera o global. */
function montarStorage(opts: { quebrado?: boolean; cotaCheia?: boolean } = {}) {
  const dados = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem(k: string) {
      if (opts.quebrado) throw new Error("storage bloqueado");
      return dados.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (opts.cotaCheia) throw new Error("QuotaExceededError");
      dados.set(k, v);
    },
  };
  return dados;
}

beforeEach(() => montarStorage());
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("o áudio guardado volta inteiro", () => {
  writeTtsCache("greet", AUDIO);
  assert.equal(readTtsCache("greet"), AUDIO);
});

test("cada fala tem sua própria chave", () => {
  writeTtsCache("greet", AUDIO);
  assert.equal(readTtsCache("bye"), null, "a despedida não pode sair como cumprimento");
  const chaves = Object.values(TTS_CACHE_KEYS);
  assert.equal(new Set(chaves).size, chaves.length, "chaves duplicadas trocariam as falas");
});

test("sobra curta demais não é áudio — é resto de resposta de erro", () => {
  // Um clipe de fala real passa de 80 caracteres em base64 com folga.
  montarStorage().set(TTS_CACHE_KEYS.greet, "erro");
  assert.equal(readTtsCache("greet"), null);
  montarStorage().set(TTS_CACHE_KEYS.greet, "Q".repeat(TTS_MIN_B64));
  assert.equal(readTtsCache("greet"), null, "exatamente no piso ainda não vale");
});

test("storage bloqueado não pode deixar o passadiço sem a Lara", () => {
  // Janela anônima, cookies de terceiro barrados: perde o cache, não a voz.
  montarStorage({ quebrado: true });
  assert.equal(readTtsCache("greet"), null);
});

test("cota cheia é silenciosa — perder cache não é falha", () => {
  montarStorage({ cotaCheia: true });
  assert.doesNotThrow(() => writeTtsCache("greet", AUDIO));
});

test("sem localStorage nenhum, a leitura devolve nulo em vez de explodir", () => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  assert.equal(readTtsCache("greet"), null);
});
