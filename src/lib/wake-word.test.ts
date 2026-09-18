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
});
