/**
 * Proa · TugLife Systems — Testes do aparo de texto falado
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.11.0 · 2026-09-20 12:00 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { trimToSentence } from "./voice-text.ts";

test("sem corte, o texto passa intacto — inclusive sem pontuação final", () => {
  assert.equal(trimToSentence("Vento de nordeste, doze nós", false), "Vento de nordeste, doze nós");
});

test("cortado no meio: apara na última frase inteira", () => {
  const cortado = "O vento tá de nordeste com doze nós. A corrente empurra pra sul. E o mar tá com Hs de um metro e a";
  assert.equal(
    trimToSentence(cortado, true),
    "O vento tá de nordeste com doze nós. A corrente empurra pra sul.",
  );
});

test("cortado exatamente no fim de uma frase: não mexe", () => {
  const t = "Falta 12 milhas. ETA às 18h.";
  assert.equal(trimToSentence(t, true), t);
  assert.equal(trimToSentence("Chegamos!", true), "Chegamos!");
  assert.equal(trimToSentence("E agora?", true), "E agora?");
});

test("cortado sem nenhuma pontuação: melhor incompleto do que vazio", () => {
  const t = "O vento tá de nordeste com doze nós e a corrente empurra pra";
  assert.equal(trimToSentence(t, true), t);
});

test("não sacrifica a resposta pra salvar um cumprimento curto", () => {
  // A única pontuação está no começo (menos de 40 % do texto): aparar ali
  // devolveria só "Boa tarde." e jogaria fora o que interessa.
  const t = "Boa tarde. O vento tá de nordeste com doze nós e a corrente empurra pra sul com meio nó e o mar";
  assert.equal(trimToSentence(t, true), t);
});

test("aceita reticências e aspas depois da pontuação", () => {
  assert.equal(trimToSentence('Ela disse "vamos." e depois', true), 'Ela disse "vamos.');
  assert.equal(trimToSentence("Calma… tá tudo bem… a gente", true), "Calma… tá tudo bem…");
});
