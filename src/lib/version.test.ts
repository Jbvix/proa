/**
 * Proa · TugLife Systems — Teste da versão
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.9.0 · 2026-09-20 02:14 UTC (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APP_VERSION } from "./version.ts";

test("a versão da tela é a mesma do package.json", () => {
  // Esta é a única amarra entre os dois. Se alguém subir a versão num lugar e
  // esquecer o outro, o tablet mostra um número que não corresponde ao código
  // que está rodando — o que é pior que não mostrar número nenhum, porque dá
  // falsa confiança na hora de investigar um problema a bordo.
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  assert.equal(
    APP_VERSION,
    pkg.version,
    `version.ts diz ${APP_VERSION} e package.json diz ${pkg.version}`,
  );
});

test("o formato é semver de três partes", () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/, `formato inesperado: ${APP_VERSION}`);
});
