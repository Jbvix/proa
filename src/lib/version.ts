/**
 * Proa · TugLife Systems — Versão do app
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.16.0  (módulo novo na 1.9.0)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * POR QUE A VERSÃO APARECE NA TELA
 * Quando alguém do passadiço diz "o app tá mostrando Hs zerado", a primeira
 * pergunta é sempre a mesma: qual versão? Sem número visível, a resposta
 * depende de adivinhar qual build está naquele tablet — e tablets diferentes,
 * atualizados em dias diferentes, rodam código diferente. Num PWA isso é pior
 * ainda, porque o aparelho pode segurar uma versão em cache por dias.
 *
 * O número fica no alto da tela, ao lado do modo de captura, onde se lê sem
 * abrir menu nenhum.
 *
 * FONTE ÚNICA DE VERDADE
 * Este valor tem de casar com o `version` do `package.json`. Não há mágica de
 * build garantindo isso — há um TESTE (`version.test.ts`) que falha se os dois
 * divergirem. Subir versão significa mexer nos dois lugares, e o teste cobra.
 * ---------------------------------------------------------------------------
 */

/** Versão publicada, igual à do `package.json`. */
export const APP_VERSION = "1.16.0";
