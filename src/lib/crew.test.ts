import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCrewNames, mergeCrew } from "./crew.ts";

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
