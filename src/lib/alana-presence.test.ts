import assert from "node:assert/strict";
import { test } from "node:test";
import { askedForName, byeLine, dayPart, greetLine, helloWord } from "./alana-presence.ts";

test("day part splits morning afternoon night", () => {
  const morning = new Date(2026, 8, 19, 8, 0, 0).getTime();
  const afternoon = new Date(2026, 8, 19, 15, 0, 0).getTime();
  const night = new Date(2026, 8, 19, 21, 0, 0).getTime();
  assert.equal(dayPart(morning), "manha");
  assert.equal(helloWord(morning), "Bom dia");
  assert.equal(dayPart(afternoon), "tarde");
  assert.equal(helloWord(afternoon), "Boa tarde");
  assert.equal(dayPart(night), "noite");
  assert.equal(helloWord(night), "Boa noite");
});

test("first greet introduces Lara and asks the name", () => {
  const t = greetLine([], new Date(2026, 8, 19, 15, 0, 0).getTime());
  assert.match(t, /Boa tarde/);
  assert.match(t, /Sou a Lara/);
  assert.match(t, /Qual o seu nome/);
});

test("later greet uses the known name", () => {
  const t = greetLine(["Jossian"], new Date(2026, 8, 19, 21, 0, 0).getTime());
  assert.match(t, /Boa noite, Jossian/);
  assert.doesNotMatch(t, /Qual o seu nome/);
  const u = greetLine(
    ["Jossian", "Pedro"],
    new Date(2026, 8, 19, 21, 0, 0).getTime(),
    "Pedro",
  );
  assert.match(u, /Pedro/);
});


test("bye uses the name when known", () => {
  assert.match(byeLine(["Jossian"]), /Jossian/);
});

test("detects a name prompt", () => {
  assert.equal(askedForName("Boa tarde. Sou a Lara, do passadiço. Qual o seu nome?"), true);
  assert.equal(askedForName("ETA hoje 11:20."), false);
});
