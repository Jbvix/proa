import assert from "node:assert/strict";
import { test } from "node:test";
import { EARTH_NM, haversineNm } from "./geo.ts";
import { nearestPlaceAny } from "./places.ts";
import { coastFix, distToCoastNm } from "./coastline.ts";

test("1° of latitude is about 60 nmi", () => {
  const d = haversineNm(0, 0, 1, 0);
  assert.ok(Math.abs(d - 60.04) < 0.05, `got ${d}`);
  assert.ok(EARTH_NM > 3439 && EARTH_NM < 3441);
});

test("Mucuripe harbour sits on the coast", () => {
  const nm = distToCoastNm(-3.718, -38.473);
  assert.ok(nm < 1.2, `coast ${nm} nmi`);
  const c = coastFix(-3.718, -38.473);
  assert.match(c.place.name, /Mucuripe|Fortaleza/);
  assert.match(c.phrase, /na costa/);
});

test("north of Mucuripe is offshore, not zero", () => {
  const nm = distToCoastNm(-3.418, -38.473);
  assert.ok(nm > 12 && nm < 26, `coast ${nm} nmi`);
  const c = coastFix(-3.418, -38.473);
  assert.match(c.phrase, /ao largo/);
  assert.ok(c.coastNm > 12);
});

test("Fortaleza downtown is inland — distance is to the beach, not 0", () => {
  const downtown = distToCoastNm(-3.731, -38.526);
  const port = nearestPlaceAny(-3.731, -38.526);
  assert.match(port.name, /Fortaleza|Mucuripe|Caucaia/);
  assert.ok(port.nm < 0.4, `place ${port.name} ${port.nm}`);
  assert.ok(downtown > 0.5, `coast ${downtown} should be inland of the beach`);
  assert.ok(downtown > port.nm + 0.4, `coast ${downtown} vs place ${port.nm}`);
  const c = coastFix(-3.731, -38.526);
  assert.match(c.phrase, /da costa/);
});

test("between Pecém and Mucuripe, slightly offshore, uses shoreline not the port", () => {
  const lat = -3.54;
  const lon = -38.765;
  const coast = distToCoastNm(lat, lon);
  const port = nearestPlaceAny(lat, lon);
  assert.ok(coast < 6, `coast ${coast} nmi`);
  assert.ok(coast < port.nm + 0.05);
});

test("far offshore stays far from the shoreline", () => {
  const nm = distToCoastNm(-3.2, -37.5);
  assert.ok(nm > 18, `coast ${nm} nmi`);
});
