/**
 * Proa · TugLife Systems — Leitura de ambiente no servidor
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.3.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DESTA VERSÃO (1.3.0)
 *  1. Removida `isWorkspacePreview()`. Existia para separar preview de app
 *     publicado na semântica de token de conector e de audiência de gate —
 *     e os dois consumidores (`app-data/` e `auth/`) saíram nesta versão.
 * ---------------------------------------------------------------------------
 */

/** Variável de ambiente, já aparada. Vazia conta como ausente. */
export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}
