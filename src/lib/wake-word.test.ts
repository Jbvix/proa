import assert from "node:assert/strict";
import { test } from "node:test";
import { hearWake, isAlanaEcho } from "./wake-word.ts";

test("Iara alone wakes with empty rest", () => {
  const h = hearWake("Iara");
  assert.equal(h.woke, true);
  assert.equal(h.rest, "");
  assert.equal(h.sleep, false);
});

test("Iara plus question keeps the rest", () => {
  const h = hearWake("Iara, qual o Hs agora?");
  assert.equal(h.woke, true);
  assert.match(h.rest, /qual o hs agora/);
});

test("Iara and Yara wake", () => {
  assert.equal(hearWake("Iara").woke, true);
  assert.equal(hearWake("oi Iara").woke, true);
  assert.equal(hearWake("Iara?").woke, true);
  assert.equal(hearWake("Yara me fala o eta").woke, true);
  assert.equal(hearWake("hiara relatório").woke, true);
});

test("old Alana name and bridge chatter do not wake", () => {
  assert.equal(hearWake("Alana").woke, false);
  assert.equal(hearWake("a lana").woke, false);
  assert.equal(hearWake("olha na derrota").woke, false);
  assert.equal(hearWake("e lá na costa").woke, false);
  assert.equal(hearWake("e a hora").woke, false);
  assert.equal(hearWake("e agora").woke, false);
  assert.equal(hearWake("a lancha passou").woke, false);
  assert.equal(hearWake("qual o vento").woke, false);
  assert.equal(hearWake("diaria de bordo").woke, false);
});

test("plain question does not wake", () => {
  const h = hearWake("qual o vento");
  assert.equal(h.woke, false);
  assert.equal(h.rest, "qual o vento");
});

test("tchau sleeps", () => {
  const h = hearWake("tchau");
  assert.equal(h.sleep, true);
  assert.equal(hearWake("Iara tchau").sleep, true);
});

test("echo of greet and last line is ignored", () => {
  assert.equal(isAlanaEcho("E aí. Tô no rádio, pode mandar."), true);
  assert.equal(isAlanaEcho("Oi. Tô no rádio, manda aí."), true);
  assert.equal(isAlanaEcho("Iara"), false);
});

test("echo of her own intro is ignored", () => {
  assert.equal(
    isAlanaEcho("Iara", "Boa tarde. Sou a Iara, do passadiço. Qual o seu nome?"),
    true,
  );
});

test("garbled speaker echo of a briefing is ignored", () => {
  const last =
    "Jossian. A gente tá a 12 milhas da costa, SOG 7.2 nós. Hs 0.8. ETA hoje 11:40.";
  assert.equal(isAlanaEcho("a gente tá a 12 milhas da costa sog 7 nós", last), true);
});

test("a real follow-up is not treated as echo", () => {
  assert.equal(isAlanaEcho("qual o hs agora", "E aí. Tô no rádio, pode mandar."), false);
  assert.equal(isAlanaEcho("Iara"), false);
});
