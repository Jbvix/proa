import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRIDGE_VAD,
  PcmRing,
  VAD_IDLE,
  downsample,
  encodeWavPcm16,
  floatTo16,
  rmsOf,
  tickVad,
} from "./voice-pcm.ts";

test("downsample 48 kHz 1 s sine to 16 kHz keeps length", () => {
  const n = 48_000;
  const src = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48_000));
  const out = downsample(src, 48_000, 16_000);
  assert.equal(out.length, 16_000);
  assert.ok(rmsOf(out) > 0.4);
});

test("wav header is 16-bit mono PCM", () => {
  const pcm = floatTo16(new Float32Array([0, 0.5, -0.5, 1]));
  const buf = encodeWavPcm16(pcm, 16_000);
  const v = new DataView(buf);
  assert.equal(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), "RIFF");
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(24, true), 16_000);
  assert.equal(buf.byteLength, 44 + 8);
});

test("short name ends after a brief pause", () => {
  let s = VAD_IDLE;
  let end = 0;
  for (let t = 0; t < 400; t += 20) s = tickVad(s, 0.08, 20).state;
  assert.equal(s.speaking, true);
  for (let t = 0; t < 250; t += 20) {
    const r = tickVad(s, 0.002, 20);
    s = r.state;
    if (r.event === "end") end += 1;
  }
  assert.equal(end, 0);
  for (let t = 0; t < 200; t += 20) {
    const r = tickVad(s, 0.002, 20);
    s = r.state;
    if (r.event === "end") end += 1;
  }
  assert.equal(end, 1);
});

test("a long question survives a 400 ms pause", () => {
  let s = VAD_IDLE;
  let end = 0;
  for (let t = 0; t < 1_600; t += 20) s = tickVad(s, 0.08, 20).state;
  for (let t = 0; t < 400; t += 20) {
    const r = tickVad(s, 0.002, 20);
    s = r.state;
    if (r.event === "end") end += 1;
  }
  assert.equal(end, 0);
  assert.equal(s.speaking, true);
  for (let t = 0; t < BRIDGE_VAD.hangMs; t += 20) {
    const r = tickVad(s, 0.002, 20);
    s = r.state;
    if (r.event === "end") end += 1;
  }
  assert.equal(end, 1);
});

test("ring sliceLast returns the most recent samples", () => {
  const r = new PcmRing(8);
  r.push([1, 2, 3, 4, 5, 6]);
  const last = r.sliceLast(3);
  assert.deepEqual([...last], [4, 5, 6]);
});
