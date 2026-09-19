import assert from "node:assert/strict";
import { test } from "node:test";
import { consultReply } from "./bridge-knowledge.ts";

test("free surface and GM stay in bridge language", () => {
  const a = consultReply("o que é superfície livre");
  assert.match(a ?? "", /Superfície livre/);
  assert.match(a ?? "", /GM/);
  assert.doesNotMatch(a ?? "", /artigo/i);
  const b = consultReply("Alana, estabilidade com lastro", { name: "Jossian", rollDeg: 14 });
  assert.match(b ?? "", /Jossian/);
  assert.match(b ?? "", /14°/);
});

test("COLREG MARPOL SOLAS NORMAM do not invent articles", () => {
  assert.match(consultReply("o que a COLREG pede na vigia") ?? "", /vigia/);
  assert.match(consultReply("pode jogar óleo na sentina, marpol") ?? "", /não despeja/);
  assert.match(consultReply("lixo no mar") ?? "", /plástico|Lixo/);
  assert.match(consultReply("homem ao mar SOLAS") ?? "", /alarme/);
  assert.match(consultReply("o que é NORMAM da DPC") ?? "", /DPC/);
  for (const q of [
    "o que a COLREG pede na vigia",
    "pode jogar óleo na sentina, marpol",
    "homem ao mar SOLAS",
    "o que é NORMAM da DPC",
  ]) {
    assert.doesNotMatch(consultReply(q) ?? "", /\b(artigo|regra)\s+\d/i);
  }
});

test("XTE explanation can use the live number", () => {
  const a = consultReply("o que é XTE", { xteNm: 0.31, xteLado: "BB" });
  assert.match(a ?? "", /derrota/);
  assert.match(a ?? "", /0\.31/);
});

test("plain voyage talk is not consulting", () => {
  assert.equal(consultReply("qual o eta"), null);
  assert.equal(consultReply("como ta o vento"), null);
});
