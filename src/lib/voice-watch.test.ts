import assert from "node:assert/strict";
import { test } from "node:test";
import { crossTrackOf } from "./geo.ts";
import { sustainedRollP2P } from "./waves.ts";
import { tickWatch, WATCH_IDLE, XTE_ON_NM, ROLL_ON_DEG } from "./voice-watch.ts";

test("eastbound track: north of the line is bombordo", () => {
  const track = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.5 },
  ];
  const xte = crossTrackOf(track, 0.01, 0.25);
  assert.ok(xte.nm > 0.5 && xte.nm < 0.7, `nm ${xte.nm}`);
  assert.equal(xte.side, "BB");
});

test("eastbound track: south of the line is estibordo", () => {
  const track = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.5 },
  ];
  const xte = crossTrackOf(track, -0.01, 0.25);
  assert.ok(xte.nm > 0.5 && xte.nm < 0.7, `nm ${xte.nm}`);
  assert.equal(xte.side, "EB");
});

test("on the GPX is linha and near zero XTE", () => {
  const track = [
    { lat: -3.72, lon: -38.47 },
    { lat: -3.53, lon: -38.8 },
  ];
  const xte = crossTrackOf(track, -3.72, -38.47);
  assert.ok(xte.nm < 0.05, `nm ${xte.nm}`);
  assert.equal(xte.side, "linha");
});

const underway = {
  sogKn: 8,
  alongNm: 2,
  remainNm: 12,
  capturing: true,
};

test("Alana calls XTE only after crossing the limit, then waits to reset", () => {
  let s = WATCH_IDLE;
  let a = tickWatch(s, { ...underway, xteNm: 0.1, rollP2P: 2 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: XTE_ON_NM, rollP2P: 2 });
  assert.equal(a.alert, "xte");
  a = tickWatch(a.state, { ...underway, xteNm: 0.4, rollP2P: 2 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: 0.05, rollP2P: 2 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: XTE_ON_NM, rollP2P: 2 });
  assert.equal(a.alert, "xte");
});

test("strong roll of the band fires once until it calms", () => {
  let s = WATCH_IDLE;
  let a = tickWatch(s, { ...underway, xteNm: 0.02, rollP2P: 4 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: 0.02, rollP2P: ROLL_ON_DEG });
  assert.equal(a.alert, "roll");
  a = tickWatch(a.state, { ...underway, xteNm: 0.02, rollP2P: 14 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: 0.02, rollP2P: 5 });
  assert.equal(a.alert, null);
  a = tickWatch(a.state, { ...underway, xteNm: 0.02, rollP2P: ROLL_ON_DEG });
  assert.equal(a.alert, "roll");
});

test("XTE wins the tick and leaves roll free to speak next", () => {
  const a = tickWatch(WATCH_IDLE, {
    ...underway,
    xteNm: 0.4,
    rollP2P: 16,
  });
  assert.equal(a.alert, "xte");
  assert.equal(a.state.xteHot, true);
  assert.equal(a.state.rollHot, false);
  const b = tickWatch(a.state, { ...underway, xteNm: 0.4, rollP2P: 16 });
  assert.equal(b.alert, "roll");
  assert.equal(b.state.rollHot, true);
});

test("parked or no capture stays quiet", () => {
  const parked = tickWatch(WATCH_IDLE, {
    xteNm: 1,
    rollP2P: 20,
    sogKn: 0,
    alongNm: 3,
    remainNm: 10,
    capturing: true,
  });
  assert.equal(parked.alert, null);
  const idle = tickWatch(WATCH_IDLE, {
    ...underway,
    xteNm: 1,
    rollP2P: 20,
    capturing: false,
  });
  assert.equal(idle.alert, null);
  const arrived = tickWatch(WATCH_IDLE, {
    ...underway,
    xteNm: 1,
    rollP2P: 20,
    remainNm: 0.2,
  });
  assert.equal(arrived.alert, null);
});

test("sustained roll ignores a one-shot tablet tilt", () => {
  const tilt = Float32Array.from({ length: 160 }, (_, i) => (i > 40 && i < 55 ? 28 : 2));
  assert.equal(sustainedRollP2P(tilt), 0);
  const sea = Float32Array.from({ length: 160 }, (_, i) => Math.sin(i * 0.08) * 8);
  const p2p = sustainedRollP2P(sea);
  assert.ok(p2p >= 14, `p2p ${p2p}`);
});
