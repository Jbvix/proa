import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROFILE, fuelHint, recommendRpm } from "./rpm.ts";
import { nearestPlaceAny } from "./places.ts";

test("nearest coast from Mucuripe is Mucuripe or Fortaleza", () => {
  const p = nearestPlaceAny(-3.718, -38.473);
  assert.match(p.name, /Mucuripe|Fortaleza/);
  assert.ok(p.nm < 4);
});

test("nearest coast always returns a place even far offshore", () => {
  const p = nearestPlaceAny(-3.2, -37.5);
  assert.ok(p.name.length > 1);
  assert.ok(p.nm > 18);
});

test("fuel hint cuts RPM when following sea and rpm is high", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 1260,
    hsM: 1.9,
    periodS: 6.5,
    windKn: 14,
    headingDeg: 300,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "popa" },
    currentRpm: 1260,
    headingDeg: 300,
    windKn: 14,
    windDir: 130,
    currentKn: 0.8,
    currentDir: 270,
  });
  assert.ok(fuel.rpmSugerido < 1260);
  assert.ok(fuel.rpmSugerido >= advice.min);
  assert.match(fuel.conselho.toLowerCase(), /rpm|faixa|favor|popa|vento|corrente/);
});

test("fuel hint does not drop below band center in head sea", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 980,
    hsM: 2.2,
    periodS: 6,
    windKn: 18,
    headingDeg: 90,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "proa" },
    currentRpm: 980,
    headingDeg: 90,
    windKn: 18,
    windDir: 90,
    currentKn: 0.5,
    currentDir: 270,
  });
  assert.equal(fuel.rpmSugerido, advice.center);
  assert.match(fuel.conselho.toLowerCase(), /proa|faixa/);
});

test("flood window overrides fuel cut", () => {
  const advice = recommendRpm({
    profile: DEFAULT_PROFILE,
    currentRpm: 1100,
    hsM: 1.2,
    periodS: 7,
    windKn: 10,
    headingDeg: 300,
    waveDirDeg: 90,
  });
  const fuel = fuelHint({
    advice: { ...advice, sea: "popa" },
    currentRpm: 1100,
    headingDeg: 300,
    windKn: 12,
    windDir: 130,
    currentKn: 0.6,
    currentDir: 280,
    floodAdvice: "Suba o SOG pra pegar a enchente.",
  });
  assert.ok(fuel.rpmSugerido >= advice.center);
  assert.match(fuel.conselho.toLowerCase(), /enchente/);
});
