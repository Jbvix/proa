import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCrewNames, extractNameAnswer, mergeCrew } from "./crew.ts";

test("picks up a bridge intro", () => {
  assert.deepEqual(extractCrewNames("Lara, meu nome é Jossian"), ["Jossian"]);
  assert.deepEqual(extractCrewNames("me chamo maria silva"), ["Maria Silva"]);
  assert.deepEqual(extractCrewNames("sou o pedro"), ["Pedro"]);
  assert.deepEqual(extractCrewNames("aqui é o carlos"), ["Carlos"]);
});

test("bare name after she asked", () => {
  assert.equal(extractNameAnswer("Jossian"), "Jossian");
  assert.equal(extractNameAnswer("sou o pedro"), "Pedro");
  assert.equal(extractNameAnswer("qual o eta de pecem"), null);
});

test("ignores the radio and generic vocatives", () => {
  assert.deepEqual(extractCrewNames("sou o cara do leme"), []);
  assert.deepEqual(extractCrewNames("qual o eta"), []);
});

test("merge keeps unique names", () => {
  assert.deepEqual(mergeCrew(["Jossian"], ["jossian", "Pedro"]), ["Jossian", "Pedro"]);
});
