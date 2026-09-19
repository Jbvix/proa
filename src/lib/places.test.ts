import assert from "node:assert/strict";
import { test } from "node:test";
import { cityPassages } from "./places.ts";
import { formatEtaDay } from "./utils.ts";

test("formatEtaDay says today or tomorrow", () => {
  const now = Date.parse("2026-09-18T23:00:00-03:00");
  assert.match(formatEtaDay(now + 20 * 60_000, now), /hoje/);
  assert.match(formatEtaDay(now + 26 * 3600_000, now), /amanhã|amanha/);
});

test("Mucuripe to Pecém lists coastal cities with ETA", () => {
  const points = [
    { lat: -3.7184, lon: -38.4732 },
    { lat: -3.608, lon: -38.628 },
    { lat: -3.5332, lon: -38.8084 },
  ];
  const now = Date.parse("2026-09-18T23:00:00-03:00");
  const passes = cityPassages(points, 0, 8, now);
  const names = passes.map((p) => p.nome);
  assert.ok(names.includes("Mucuripe") || names.includes("Fortaleza"), names.join(","));
  const pecem = passes.find((p) => p.nome === "Pecém");
  assert.ok(pecem, `got ${names.join(",")}`);
  assert.equal(pecem!.passou, false);
  assert.ok((pecem!.faltaNm ?? 0) > 5);
  assert.ok(pecem!.eta && pecem!.eta !== "já passou");
});
