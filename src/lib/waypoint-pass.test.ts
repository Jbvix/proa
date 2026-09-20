import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PASS_IDLE,
  tickWaypointPass,
  waypointMarks,
  waypointReport,
  type WpMark,
} from "./waypoint-pass.ts";
import type { ParsedRoute } from "./gpx.ts";

const marks: WpMark[] = [
  { nome: "Saída", nm: 0 },
  { nome: "WP meio", nm: 8.2 },
  { nome: "Pecém", nm: 18.4 },
];

const go = { sogKn: 7, capturing: true, marks };

test("does not dump waypoints already behind on start", () => {
  const a = tickWaypointPass(PASS_IDLE, { ...go, alongNm: 9 });
  assert.equal(a.passed, null);
  assert.equal(a.state.primed, true);
  const b = tickWaypointPass(a.state, { ...go, alongNm: 9.1 });
  assert.equal(b.passed, null);
});

test("fires once when the tug crosses a waypoint", () => {
  let s = tickWaypointPass(PASS_IDLE, { ...go, alongNm: 7.8 }).state;
  let a = tickWaypointPass(s, { ...go, alongNm: 8.15 });
  assert.equal(a.passed?.nome, "WP meio");
  a = tickWaypointPass(a.state, { ...go, alongNm: 8.4 });
  assert.equal(a.passed, null);
});

test("origin at mile 0 never speaks", () => {
  const a = tickWaypointPass(PASS_IDLE, { ...go, alongNm: 0.05 });
  const b = tickWaypointPass(a.state, { ...go, alongNm: 0.2 });
  assert.equal(b.passed, null);
});

test("parked stays quiet", () => {
  const a = tickWaypointPass(PASS_IDLE, { ...go, alongNm: 7.8, sogKn: 0 });
  const b = tickWaypointPass(a.state, { ...go, alongNm: 8.2, sogKn: 0 });
  assert.equal(b.passed, null);
});

test("marks follow GPX waypoints on the track", () => {
  const route = {
    name: "teste",
    source: "t.gpx",
    distanceNm: 20,
    points: [
      { lat: -3.72, lon: -38.47 },
      { lat: -3.62, lon: -38.64 },
      { lat: -3.53, lon: -38.8 },
    ],
    waypoints: [
      { lat: -3.72, lon: -38.47, name: "Saída Mucuripe" },
      { lat: -3.62, lon: -38.64, name: "WP meio" },
      { lat: -3.53, lon: -38.8, name: "Chegada Pecém" },
    ],
  } as ParsedRoute;
  const m = waypointMarks(route);
  assert.equal(m.length, 3);
  assert.ok(m[1]!.nm > 1, `mid ${m[1]!.nm}`);
  assert.ok(m[2]!.nm > m[1]!.nm);
});

test("report uses live numbers and does not say the wake name", () => {
  const t = waypointReport(
    { nome: "WP meio", nm: 8.2 },
    {
      name: "Jossian",
      sogKn: 7.2,
      hsM: 0.8,
      estado: "marulhado",
      ventoKn: 12,
      ventoCard: "E",
      remainNm: 18.4,
      eta: "hoje 11:40",
      nextNome: "Pecém",
      nextFaltaNm: 10,
      mare: "enchente",
      xteNm: 0.04,
    },
    18.4,
  );
  assert.match(t, /Jossian/);
  assert.match(t, /Passando WP meio/);
  assert.match(t, /7\.2 nós/);
  assert.match(t, /Pecém/);
  assert.doesNotMatch(t, /Lara/i);
  assert.doesNotMatch(t, /Iara/i);
  assert.doesNotMatch(t, /Alana/i);
  assert.doesNotMatch(t, /Um momento/i);
});
