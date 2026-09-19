import assert from "node:assert/strict";
import { test } from "node:test";
import { matchVoice, printScore, upsertVoice, voicePrint } from "./voice-print.ts";

function tone(hz: number, sec = 0.7, sr = 16_000) {
  const n = Math.floor(sr * sec);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / sr) * 12_000);
  return pcm;
}

test("same voice print scores high, different pitch scores lower", () => {
  const a = voicePrint(tone(180));
  const b = voicePrint(tone(180));
  const c = voicePrint(tone(420));
  assert.ok(a && b && c);
  assert.ok(printScore(a, b) > 0.97, `same ${printScore(a, b)}`);
  assert.ok(printScore(a, c) < printScore(a, b), `diff ${printScore(a, c)} same ${printScore(a, b)}`);
});

test("enroll and match the colleague", () => {
  const j = voicePrint(tone(160))!;
  const p = voicePrint(tone(380))!;
  let bank = upsertVoice([], "Jossian", j);
  bank = upsertVoice(bank, "Pedro", p);
  const hit = matchVoice(bank, voicePrint(tone(160)));
  assert.equal(hit?.name, "Jossian");
  assert.equal(matchVoice(bank, voicePrint(tone(2000))), null);
});
