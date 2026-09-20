/**
 * Proa · TugLife Systems — Aparo de texto falado
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.11.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE
 * Na 1.11.0 (P11, item 11.6) o teto de tokens da resposta caiu de 220 para
 * 130. Menos tokens é menos tempo de chat E menos tempo de síntese — a Lara
 * responde como se fala no passadiço, em duas ou três frases, não em parágrafo.
 *
 * Só que um teto de tokens é uma guilhotina: quando o modelo passa dele, a
 * resposta acaba no meio da frase — "o vento tá de nordeste com doze nós e a
 * corr". Lido, isso é feio. FALADO, é um defeito: a voz cai como se a linha
 * tivesse caído. Este módulo apara a resposta na última frase inteira sempre
 * que o modelo avisou que bateu no teto (`finish_reason === "length"`).
 *
 * É a boca de lobo do cabo: melhor perder meio metro de ponta do que deixar o
 * cabo se desfiando.
 * ---------------------------------------------------------------------------
 */

/** Fim de frase reconhecido: ponto, exclamação, interrogação ou reticências. */
const SENTENCE_END = /[.!?…]/g;

/**
 * Apara `text` na última frase completa, quando `cut` diz que a resposta foi
 * cortada pelo teto de tokens.
 *
 * Comportamento conforme as variáveis:
 *   `cut === false`                      → devolve o texto como veio
 *   `cut === true`, termina em pontuação → devolve como veio (cortou no limite
 *                                           exato de uma frase, sorte)
 *   `cut === true`, há pontuação antes   → devolve até a última pontuação,
 *                                           inclusive
 *   `cut === true`, nenhuma pontuação    → devolve como veio: melhor uma frase
 *                                           incompleta do que resposta vazia
 *
 * A pontuação tem de estar a partir do 40 % do texto: aparar "Boa tarde. e o
 * vento tá de nordeste com doze nós e a corr" para "Boa tarde." jogaria fora
 * a resposta inteira para salvar o cumprimento.
 */
export function trimToSentence(text: string, cut: boolean): string {
  const t = text.trim();
  if (!cut || !t) return t;
  if (/[.!?…]["»)]?$/.test(t)) return t;
  let last = -1;
  for (const m of t.matchAll(SENTENCE_END)) last = m.index;
  if (last < 0 || last < t.length * 0.4) return t;
  return t.slice(0, last + 1).trim();
}
