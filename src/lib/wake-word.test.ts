import assert from "node:assert/strict";
import { test } from "node:test";
import { hearWake } from "./wake-word.ts";

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
  assert.equal(hearWake("Halana").woke, true);
  assert.equal(hearWake("boa noite Alana").woke, true);
});

test("plain question does not wake", () => {
  const h = hearWake("qual o vento");
  assert.equal(h.woke, false);
  assert.equal(h.rest, "qual o vento");
  assert.equal(hearWake("fala comigo").woke, false);
});

test("tchau sleeps", () => {
  const h = hearWake("tchau");
  assert.equal(h.sleep, true);
  assert.equal(hearWake("Alana tchau").sleep, true);
  assert.equal(hearWake("pode parar").sleep, true);
});
