/**
 * Proa · TugLife Systems — Testes da migração do estado guardado
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.8.0 · 2026-09-20 02:14 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEAD_SETTINGS_KEYS,
  SETTINGS_VERSION,
  migrateSettings,
} from "./settings-migrate.ts";

/** Como ficou o `localStorage` de um tablet que usou o turno antes da 1.5.0. */
function blobAntigo() {
  return {
    onboarded: true,
    theme: "night",
    crewNames: ["Jossian", "Pedro"],
    crewWatches: [
      { name: "Pedro", endMs: 1_700_000_000_000, warned: false, fired: false },
      { name: "Jossian", endMs: 1_700_020_000_000, warned: true, fired: true },
    ],
    rpm: 920,
    profile: { idle: 450, cruise: 980, max: 1600 },
  };
}

test("o turno gravado por versão antiga é apagado do aparelho", () => {
  // Nome de tripulante e hora de fim de turno ficaram órfãos no localStorage
  // quando o recurso saiu na 1.5.0, sem tela que mostrasse nem apagasse.
  const r = migrateSettings(blobAntigo(), 0) as Record<string, unknown>;
  assert.equal("crewWatches" in r, false, "o turno tinha de ter saído");
  assert.equal(JSON.stringify(r).includes("endMs"), false, "sobrou hora de turno");
});

test("o que ainda tem dono não é tocado", () => {
  // A migração joga fora o órfão, não faz faxina geral. Nomes da tripulação
  // seguem em uso: são eles que fazem a Lara chamar o pessoal pelo nome.
  const r = migrateSettings(blobAntigo(), 0) as Record<string, unknown>;
  assert.deepEqual(r.crewNames, ["Jossian", "Pedro"]);
  assert.equal(r.rpm, 920);
  assert.equal(r.theme, "night");
  assert.deepEqual(r.profile, { idle: 450, cruise: 980, max: 1600 });
  assert.equal(r.onboarded, true);
});

test("blob já na versão atual passa intacto", () => {
  const atual = { theme: "day", rpm: 1000, crewNames: ["Carlos"] };
  assert.deepEqual(migrateSettings(atual, SETTINGS_VERSION), atual);
});

test("a migração não altera o objeto guardado que recebeu", () => {
  // Mutar a entrada corromperia o estado que o zustand ainda vai mesclar.
  const original = blobAntigo();
  migrateSettings(original, 0);
  assert.ok("crewWatches" in original, "a entrada não pode ser mutada");
});

test("lixo no storage vira padrão em vez de derrubar o app", () => {
  // localStorage corrompido, editado à mão, ou de outra origem: o passadiço
  // não pode ficar sem instrumento por causa de um JSON estragado.
  for (const ruim of [null, undefined, 42, "texto", [], true]) {
    assert.deepEqual(migrateSettings(ruim, 0), {}, String(ruim));
  }
});

test("blob sem o turno atravessa a migração sem novidade", () => {
  // Quem instalou o app depois da 1.5.0 nunca gravou turno nenhum.
  const novo = { theme: "night", crewNames: ["Ana"], rpm: 900 };
  assert.deepEqual(migrateSettings(novo, 0), novo);
});

test("a lista de campos mortos e a versão andam juntas", () => {
  // Contrato pra quem remover um campo persistido daqui pra frente: põe o nome
  // na lista E sobe a versão, senão o dado fica no tablet de alguém.
  assert.ok(DEAD_SETTINGS_KEYS.length > 0);
  assert.ok(SETTINGS_VERSION >= 1, "versão 0 nunca dispara migração");
  assert.ok(DEAD_SETTINGS_KEYS.includes("crewWatches"));
});
