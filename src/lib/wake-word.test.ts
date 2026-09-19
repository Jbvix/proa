import assert from "node:assert/strict";
import { test } from "node:test";
import { hearWake, isAlanaEcho } from "./wake-word.ts";

test("Alana alone wakes with empty rest", () => {
  const h = hearWake("Alana");
  assert.equal(h.woke, true);
  assert.equal(h.rest, "");
  assert.equal(h.sleep, false);
});

test("Alana plus question keeps the rest", () => {
  const h = hearWake("Alana, qual o Hs agora?");
  assert.equal(h.woke, true);
  assert.match(h.rest, /qual o hs agora/);
});

test("oi alana and a lana still wake", () => {
  assert.equal(hearWake("oi Alana").woke, true);
  assert.equal(hearWake("a lana").woke, true);
  assert.equal(hearWake("Allana me fala o eta").woke, true);
  assert.equal(hearWake("olana, qual o hs").woke, true);
  assert.equal(hearWake("elana tchau").woke, true);
  assert.equal(hearWake("Alana?").woke, true);
  assert.equal(hearWake("halana relatório").woke, true);
  assert.equal(hearWake("alanna relatório").woke, true);
  assert.equal(hearWake("alanah, eta").woke, true);
});

test("plain question does not wake", () => {
  const h = hearWake("qual o vento");
  assert.equal(h.woke, false);
  assert.equal(h.rest, "qual o vento");
});

test("tchau sleeps", () => {
  const h = hearWake("tchau");
  assert.equal(h.sleep, true);
  assert.equal(hearWake("Alana tchau").sleep, true);
});

test("echo of greet and last line is ignored", () => {
  assert.equal(isAlanaEcho("Oi. Tô no rádio, manda aí."), true);
  assert.equal(isAlanaEcho("Beleza. Me chama se precisar."), true);
  assert.equal(isAlanaEcho("Oi. Tô na escuta."), true);
  assert.equal(isAlanaEcho("Fechou. Me chama quando precisar."), true);
  assert.equal(isAlanaEcho("Sou a Alana, rádio do passadiço.", "Sou a Alana, rádio do passadiço."), true);
  assert.equal(isAlanaEcho("qual o hs agora"), false);
  assert.equal(
    isAlanaEcho("Olha só. A gente abriu demais da derrota. XTE alto — volta pra linha."),
    true,
  );
  assert.equal(isAlanaEcho("Ó o balanço de banda. Tá forte. Segura o rumo e a faixa de RPM."), true);
  assert.equal(isAlanaEcho("Não peguei. Manda de novo."), true);
});

const LAST =
  "Beleza. A gente tá em 3.7182° S, 38.4725° W, bem em Mucuripe — costa a zero milha.";

test("garbled speaker echo of a briefing is ignored", () => {
  assert.equal(
    isAlanaEcho("Beleza a gente ta em 3.7182 S 38.4725 W bem em Mucuripe costa a zero", LAST),
    true,
  );
  assert.equal(
    isAlanaEcho("Alana a gente ta em 37182 Mucuripe costa zero milha", LAST),
    true,
  );
});

test("a real follow-up is not treated as echo", () => {
  assert.equal(isAlanaEcho("qual o hs agora", LAST), false);
  assert.equal(isAlanaEcho("e o combustível", LAST), false);
  assert.equal(isAlanaEcho("Alana, qual o vento", LAST), false);
});
