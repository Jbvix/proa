/**
 * Proa · TugLife Systems — Escolha da voz local do aparelho
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.11.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P11, item 11.1)
 * Quando a resposta nasce no próprio tablet — "qual o SOG", "e o vento",
 * "como tá o Hs" — o texto está pronto em microssegundos. Até a 1.10.0 esse
 * texto ainda atravessava a rede pra virar voz: 1 a 3 s de `fetchSay()` pra
 * dizer um número que o aparelho já tinha na mão. Era a pergunta mais comum do
 * passadiço sendo a mais desnecessariamente lenta.
 *
 * A partir da 1.11.0 essas respostas saem pela voz do próprio Android
 * (`speechSynthesis`), sem rede. A voz não é a da Lara (a "ara" do xAI): é a
 * voz pt-BR que o sistema tiver. Troca-se identidade de voz por resposta
 * imediata — nas frases curtas e factuais, e só nelas. Consultoria, relatório
 * e conversa continuam com a voz dela.
 *
 * ESTE MÓDULO É SÓ A ESCOLHA DA VOZ. Não há DOM aqui: entra a lista que o
 * navegador deu, sai a melhor candidata ou `null`. Quem fala é `voice-play.ts`.
 * Separar permite testar a preferência sem navegador.
 *
 * A REGRA DE ESCOLHA, e por que nessa ordem
 *   1. `pt-BR` antes de qualquer outro `pt`: "Português (Portugal)" lendo
 *      "tá", "pra" e "nós" soa a outro navio.
 *   2. Entre as pt-BR, a que não é "compacta"/"compact": no Android as vozes
 *      compactas são as de fábrica, de qualidade inferior às baixadas.
 *   3. Sem nenhuma voz `pt`: devolve `null`, e o chamador volta à rede. Uma
 *      frase em português lida por voz inglesa é pior que 2 s de espera.
 * ---------------------------------------------------------------------------
 */

/** O que interessa de `SpeechSynthesisVoice`, pra não depender do DOM no teste. */
export type LocalVoice = {
  name: string;
  lang: string;
};

/** Voz que o Android marca como de fábrica/compacta — última escolha. */
const COMPACT = /compact|compacta/i;

/**
 * A melhor voz em português da lista, ou `null` se não houver nenhuma.
 *
 * Comportamento conforme as variáveis:
 *   lista vazia                       → `null`
 *   só vozes não-pt                   → `null`
 *   pt-BR não compacta disponível     → ela
 *   só pt-BR compacta                 → ela mesmo assim
 *   só pt-PT (ou outro pt)            → a primeira, não compacta se houver
 */
export function pickLocalVoice<V extends LocalVoice>(voices: readonly V[]): V | null {
  const pt = voices.filter((v) => /^pt([-_]|$)/i.test(v.lang));
  if (!pt.length) return null;
  const br = pt.filter((v) => /^pt[-_]br$/i.test(v.lang));
  const pool = br.length ? br : pt;
  return pool.find((v) => !COMPACT.test(v.name)) ?? pool[0];
}

/**
 * Teto de espera pelo início da fala local, em ms. Se o motor não começar
 * nesse prazo, o chamador desiste e vai à rede — a espera fica limitada,
 * que era o objetivo todo.
 */
export const LOCAL_START_TIMEOUT_MS = 1_500;

/**
 * Duração máxima admitida para uma fala local, em ms, a partir do texto.
 * Fala de passadiço sai a ~14 caracteres por segundo; 70 ms/char dá quase
 * o dobro de folga, mais 1,5 s de partida. Acima disso o `onend` não veio e
 * o motor travou — solta-se a linha.
 */
export function localSpeechCapMs(text: string): number {
  return Math.min(30_000, 1_500 + text.length * 70);
}
