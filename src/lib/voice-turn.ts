/**
 * Proa · TugLife Systems — Roteamento do turno de conversa
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.7.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * O QUE ESTE MÓDULO DECIDE
 * Chegou uma transcrição do microfone. O que fazer com ela? Ignorar, guardar
 * pra depois, acordar a Lara, mandar a pergunta, abrir ou encerrar a conversa.
 * Era uma escada de nove `return` dentro do componente, misturada com `setState`
 * e `void ask(...)`, e portanto sem como testar. Aqui a decisão é pura: entram
 * os fatos, sai UMA rota. Quem fala, toca áudio e mexe em React é o componente.
 *
 * A ORDEM DAS PERGUNTAS É O PRÓPRIO COMPORTAMENTO, e é esta:
 *   1. A Lara está ocupada?   → guarda o que valer a pena, descarta o resto
 *   2. Veio vazio?            → nada a fazer
 *   3. Conversa aberta ou PTT?→ trata como fala dirigida a ela
 *   4. Senão                  → só acorda se chamarem pelo nome
 *
 * POR QUE GUARDAR EM VEZ DE DESCARTAR (rota `defer`)
 * O microfone continua ouvindo enquanto a Lara fala e enquanto a cadeia de
 * áudio esfria. Quem está no passadiço não sabe disso e não espera: emenda a
 * pergunta por cima da resposta. Descartar seria obrigar a repetir; responder
 * na hora seria atropelar a própria fala. Então guarda-se a pergunta e ela é
 * servida quando a linha abre — como o rádio que se espera liberar antes de
 * chamar, em vez de falar por cima.
 * ---------------------------------------------------------------------------
 */
import { hearWake } from "./wake-word.ts";

/** Fala curta demais, atrás de uma chamada pelo nome, não é pergunta guardável. */
const MIN_ASK_AFTER_WAKE = 6;
/** Em conversa aberta a régua é menor: já se sabe que é com ela. */
const MIN_ASK_IN_TALK = 4;

export type HeardInput = {
  /** A transcrição, já aparada. */
  text: string;
  /** O transcritor fechou a frase, ou ainda é parcial? */
  isFinal: boolean;
  /** Veio do botão de apertar-pra-falar. */
  fromPtt: boolean;
  /** A Lara está falando, pensando, esfriando ou surda por eco. */
  busy: boolean;
  /** A conversa está aberta (o usuário tocou em Conversar). */
  talkOn: boolean;
  /** Ainda dentro da janela de eco da apresentação dela. */
  inIntroEcho: boolean;
};

export type HeardRoute =
  /** Não é pra ela, ou é o próprio eco. Só desliga o "pensando". */
  | { kind: "ignore" }
  /** Vale a pena, mas a linha está ocupada. Guarda e serve depois. */
  | { kind: "defer" }
  /**
   * Pediram pra encerrar com a conversa ABERTA (ou com o botão apertado).
   * Fecha o turno pelo caminho da conversa.
   */
  | { kind: "endTalk" }
  /**
   * Pediram pra encerrar CHAMANDO PELO NOME, com a conversa fechada. Caminho
   * diferente de propósito: aqui ela abre a gaveta, se despede e estaciona.
   * Achatar os dois numa rota só faria a despedida sumir quando a conversa não
   * estivesse aberta.
   */
  | { kind: "sleep" }
  /** Chamaram pelo nome sem pedir nada, com a conversa fechada: abre. */
  | { kind: "startTalk" }
  /** Pergunta pronta pra ir. */
  | { kind: "ask"; question: string }
  /** Acordou pelo nome. `rest` vazio é só cumprimento. */
  | { kind: "wake"; rest: string };

/**
 * Para onde vai o que o microfone captou.
 *
 * @param input fatos do momento
 * @param isEcho predicado de eco — recebe um texto e diz se é a própria Lara
 *   de volta. Injetado em vez de importado pra que o teste possa forçar os
 *   dois lados sem depender das heurísticas de `wake-word`.
 */
export function routeHeard(
  input: HeardInput,
  isEcho: (s: string) => boolean,
): HeardRoute {
  const text = input.text.trim();
  const parse = hearWake(text);

  // 1. Linha ocupada. Só se guarda o que tem cara de pergunta de verdade:
  //    curto demais é ruído de cabine, e eco é a própria Lara voltando.
  if (input.busy) {
    const q = parse.woke ? parse.rest : text;
    const vale = parse.woke
      ? parse.rest.length >= MIN_ASK_AFTER_WAKE && !isEcho(parse.rest)
      : input.talkOn && q.length >= MIN_ASK_IN_TALK && !isEcho(q) && !parse.sleep;
    return vale ? { kind: "defer" } : { kind: "ignore" };
  }

  // 2. Silêncio transcrito como vazio.
  if (!text) return { kind: "ignore" };

  // 3. Conversa aberta, ou dedo no botão: tudo que vier é dirigido a ela, e
  //    não precisa chamar pelo nome a cada frase.
  if (input.fromPtt || input.talkOn) {
    if (parse.sleep) return { kind: "endTalk" };
    const q = parse.woke ? parse.rest : text;
    if (!q) {
      // Só o nome, sem pedido. Com a conversa fechada isso abre a conversa;
      // com ela já aberta é a pessoa se corrigindo no meio da frase.
      return input.talkOn ? { kind: "ignore" } : { kind: "startTalk" };
    }
    if (isEcho(text) || isEcho(q)) return { kind: "ignore" };
    return { kind: "ask", question: q };
  }

  // 4. Conversa fechada: só o nome dela acorda, e só em frase fechada. Frase
  //    parcial acordaria a Lara no meio de uma palavra parecida.
  if (!parse.woke || !input.isFinal) return { kind: "ignore" };

  // Ela acabou de se apresentar; o "Lara" que volta é o alto-falante.
  if (!parse.rest && input.inIntroEcho) return { kind: "ignore" };

  if (isEcho(text) || (parse.rest && isEcho(parse.rest))) return { kind: "ignore" };

  if (parse.sleep) return { kind: "sleep" };
  return { kind: "wake", rest: parse.rest };
}
