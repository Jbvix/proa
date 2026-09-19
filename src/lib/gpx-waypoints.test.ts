import assert from "node:assert/strict";
import { test } from "node:test";
import { namedWaypointsFrom, type RoutePoint } from "./gpx.ts";
import { nearestProgress } from "./geo.ts";

const trk: RoutePoint[] = [
  { lat: -3.72, lon: -38.47, name: "Fortaleza" },
  { lat: -3.62, lon: -38.64 },
  { lat: -3.53, lon: -38.8, name: "Pecém" },
];

test("named wpt stay on the derrota", () => {
  const wpt: RoutePoint[] = [
    { lat: -3.72, lon: -38.47, name: "Saída Mucuripe" },
    { lat: -3.62, lon: -38.64, name: "WP meio" },
    { lat: -3.53, lon: -38.8, name: "Chegada Pecém" },
  ];
  const w = namedWaypointsFrom(wpt, [], trk);
  assert.equal(w.length, 3);
  assert.equal(w[0]?.name, "Saída Mucuripe");
  assert.equal(w[1]?.name, "WP meio");
  assert.equal(w[2]?.name, "Chegada Pecém");
});

test("unnamed wpt get WP n so the radio still sees them", () => {
  const wpt: RoutePoint[] = [
    { lat: -3.7, lon: -38.5 },
    { lat: -3.6, lon: -38.7 },
  ];
  const w = namedWaypointsFrom(wpt);
  assert.equal(w.length, 2);
  assert.equal(w[0]?.name, "WP 1");
  assert.equal(w[1]?.name, "WP 2");
});

test("named track points fill in when the GPX has no wpt", () => {
  const w = namedWaypointsFrom([], [], trk);
  assert.equal(w.length, 2);
  assert.equal(w[0]?.name, "Fortaleza");
  assert.equal(w[1]?.name, "Pecém");
});

test("waypoint along-track nm is not zero when off a meteo station", () => {
  const mid = { lat: -3.62, lon: -38.64 };
  const along = nearestProgress(trk, mid.lat, mid.lon);
  assert.ok(along > 1, `along ${along}`);
  const total = nearestProgress(trk, trk[2]!.lat, trk[2]!.lon);
  assert.ok(along < total, `along ${along} total ${total}`);
});
