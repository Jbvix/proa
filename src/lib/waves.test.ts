import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detrend,
  hullWaveFromHeave,
  hsFromHeaveStd,
  stdev,
  HS_HULL_MAX,
} from "./waves.ts";

test("detrend removes a linear ramp that would fake a huge Hs", () => {
  const n = 900;
  const ramp = Float32Array.from({ length: n }, (_, i) => i * 0.1);
  const rawHs = hsFromHeaveStd(stdev(ramp));
  assert.ok(rawHs > 50, `ramp Hs should be huge, got ${rawHs}`);
  const d = detrend(ramp);
  const hs = hsFromHeaveStd(stdev(d));
  assert.ok(hs < 0.05, `detrended Hs ${hs}`);
});

test("sine 1 m / 8 s at 10 Hz yields Hs ≈ 2.8 m, not hundreds", () => {
  const dt = 0.1;
  const T = 8;
  const A = 1;
  const n = 800;
  const s = Float32Array.from(
    { length: n },
    (_, i) => A * Math.sin((2 * Math.PI * i * dt) / T),
  );
  const w = hullWaveFromHeave(s, dt);
  assert.ok(w.hsM > 2.4 && w.hsM < 3.2, `hs ${w.hsM}`);
  assert.ok(w.periodS > 7 && w.periodS < 9, `Tz ${w.periodS}`);
  assert.equal(w.clamped, false);
});

test("drifted heave is clamped at hull max", () => {
  const dt = 0.1;
  const s = Float32Array.from(
    { length: 400 },
    (_, i) => 12 * Math.sin((2 * Math.PI * i * dt) / 8),
  );
  const w = hullWaveFromHeave(s, dt);
  assert.equal(w.hsM, HS_HULL_MAX);
  assert.equal(w.clamped, true);
});
