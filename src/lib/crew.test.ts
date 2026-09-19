import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dueWarn,
  dueWatch,
  dropWatch,
  extractCrewNames,
  mergeCrew,
  parseClockPt,
  parseWatchAsk,
  parseWatchCancel,
  watchLine,
  watchWarnLine,
} from "./crew.ts";

test("picks up a bridge intro", () => {
  assert.deepEqual(extractCrewNames("Alana, meu nome é Jossian"), ["Jossian"]);
  assert.deepEqual(extractCrewNames("me chamo maria silva"), ["Maria Silva"]);
  assert.deepEqual(extractCrewNames("sou o pedro"), ["Pedro"]);
  assert.deepEqual(extractCrewNames("aqui é o carlos"), ["Carlos"]);
});

test("ignores the radio and generic vocatives", () => {
  assert.deepEqual(extractCrewNames("sou o cara do leme"), []);
  assert.deepEqual(extractCrewNames("qual o eta"), []);
});

test("merge keeps unique names", () => {
  assert.deepEqual(mergeCrew(["Jossian"], ["jossian", "Pedro"]), ["Jossian", "Pedro"]);
});

test("clocks land on the next occurrence", () => {
  const now = Date.parse("2026-09-18T23:10:00-03:00");
  const midnight = parseClockPt("meia-noite", now);
  assert.ok(midnight && midnight > now);
  assert.equal(new Date(midnight!).getHours(), 0);
  const eight = parseClockPt("as 8 da manha", now);
  assert.ok(eight && eight > now);
  assert.equal(new Date(eight!).getHours(), 8);
  const night = parseClockPt("20h", now);
  assert.ok(night);
  assert.equal(new Date(night!).getHours(), 20);
  const rel = parseClockPt("daqui 2 horas", now);
  assert.ok(rel && Math.abs(rel - now - 2 * 3600_000) < 1000);
});

test("watch ask captures name and time", () => {
  const now = Date.parse("2026-09-18T23:10:00-03:00");
  const a = parseWatchAsk("Alana, avisa o Jossian as 8 da manha", [], now);
  assert.ok(a);
  assert.equal(a!.name, "Jossian");
  assert.equal(new Date(a!.endMs).getHours(), 8);
  const b = parseWatchAsk("meu turno acaba meia noite", ["Jossian"], now);
  assert.ok(b);
  assert.equal(b!.name, "Jossian");
  const c = parseWatchAsk("sou o Pedro, avisa meu fim de turno as 20h", [], now);
  assert.ok(c);
  assert.equal(c!.name, "Pedro");
  assert.equal(parseWatchAsk("qual o eta de pecem", ["Jossian"], now), null);
});

test("due watch fires in the window and the line uses the name", () => {
  const now = Date.parse("2026-09-18T08:00:00-03:00");
  const w = { name: "Jossian", endMs: now, warned: true, fired: false };
  assert.equal(dueWatch([w], now)?.name, "Jossian");
  assert.match(watchLine(w), /Jossian/);
  assert.match(watchLine(w), /Fim de turno/);
  assert.equal(dueWatch([{ ...w, fired: true }], now), null);
});

test("five-minute warn calls the name before the end", () => {
  const end = Date.parse("2026-09-18T08:00:00-03:00");
  const w = { name: "Pedro", endMs: end, warned: false, fired: false };
  assert.equal(dueWarn([w], end - 5 * 60_000)?.name, "Pedro");
  assert.equal(dueWarn([{ ...w, warned: true }], end - 5 * 60_000), null);
  assert.match(watchWarnLine(w, end - 5 * 60_000), /Pedro/);
  assert.match(watchWarnLine(w, end - 5 * 60_000), /5 minutos/);
});

test("cancel drops the named watch", () => {
  const now = Date.parse("2026-09-18T08:00:00-03:00");
  const watches = [{ name: "Jossian", endMs: now + 3600_000, warned: false, fired: false }];
  assert.equal(parseWatchCancel("cancela o turno do Jossian", ["Jossian"], watches), "Jossian");
  assert.equal(parseWatchCancel("cancela o aviso", ["Jossian"], watches), "Jossian");
  assert.deepEqual(dropWatch(watches, "Jossian"), []);
});

