/**
 * Proa · TugLife Systems — Roteamento do turno de conversa
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.14.0  (módulo novo na 1.7.0)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.14.0 (P13, item 13.3) — A JANELA DE CONTINUAÇÃO
 * O prazo de 90 s da 1.10.0 tinha um furo: cada resposta da Lara renovava o
 * prazo. Num passadiço movimentado, com gente falando perto do tablet a cada
 * minuto, a conversa nunca expirava — e cada frase de 4 caracteres ia pro
 * modelo. Agora, com a conversa aberta, fala SEM o nome só é aceita dentro
 * de `FOLLOW_UP_MS` (10 s) depois de ela terminar de falar: o tempo de
 * emendar a pergunta seguinte. Fora da janela, mesmo com a gaveta aberta,
 * é preciso chamar "Lara". É como se fala num rádio com o canal aberto: o
 * que vem logo depois da resposta é pra ela; o que vem um minuto depois é
 * papo de ponte.
 *
 * A janela vale com a gaveta aberta OU fechada: "Lara, qual o vento?" →
 * resposta → "e a corrente?" nos 10 s seguintes dispensa o nome. Mas ela só
 * abre depois de uma RESPOSTA a alguém — nunca depois de um aviso
 * espontâneo (XTE, waypoint, hora cheia): comentar o relatório não é falar
 * com ela. Quem decide isso é o componente, que sabe o que acabou de tocar.
 *
 * `MIN_ASK_IN_TALK` subiu de 4 para 10: "sim." não é pergunta.
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
/** Em conversa aberta a régua é menor que atrás do nome — mas 4 era "sim.". */
const MIN_ASK_IN_TALK = 10;

/**
 * Janela depois de a Lara terminar de falar em que a fala seguinte, sem o
 * nome dela, ainda é pra ela. 10 s: o tempo de ouvir a resposta, pensar e
 * emendar. Mais que isso já é outra conversa.
 */
export const FOLLOW_UP_MS = 10_000;

/** A fala de agora cai na janela de continuação? `spokeEndMono` negativo = nunca falou. */
export function inFollowUp(spokeEndMono: number, nowMono: number): boolean {
  return nowMono - spokeEndMono <= FOLLOW_UP_MS;
}

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
  /**
   * Estamos nos 10 s depois de a Lara terminar de RESPONDER a alguém (ou de
   * a conversa abrir). Só aí a fala sem o nome dela é dela. Enquanto ela
   * fala, é `false`: o que se diz por cima só conta se a nomear. Depois de
   * um aviso espontâneo também é `false`.
   */
  followUp: boolean;
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
      : input.followUp && q.length >= MIN_ASK_IN_TALK && !isEcho(q) && !parse.sleep;
    return vale ? { kind: "defer" } : { kind: "ignore" };
  }

  // 2. Silêncio transcrito como vazio.
  if (!text) return { kind: "ignore" };

  // 3. Dedo no botão, ou DENTRO da janela de continuação (gaveta aberta ou
  //    não): é dirigido a ela, sem precisar do nome. Fora da janela cai no
  //    passo 4 — e lá só o nome acorda, gaveta aberta ou não. A despedida
  //    com a conversa aberta ainda fecha o turno a qualquer momento.
  if (input.talkOn && parse.sleep) return { kind: "endTalk" };
  if (input.fromPtt || input.followUp) {
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
