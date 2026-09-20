/**
 * Proa · TugLife Systems — Memória do que a Lara acabou de falar
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.4.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * O microfone do tablet ouve o alto-falante do tablet. Sem guarda, a Lara fala
 * "Passando a Ponta do Mucuripe", o microfone capta a própria frase, o
 * transcritor devolve ela de volta, e a Lara responde à si mesma — um laço de
 * realimentação acústica, igualzinho ao microfonia de um rádio VHF com o
 * volume aberto ao lado do próprio alto-falante.
 *
 * POR QUE GUARDAR DUAS FALAS, E NÃO UMA
 * O transcritor entrega com atraso. Enquanto o eco da frase N ainda está
 * viajando pela cadeia de áudio, a Lara já pode ter dito a frase N+1. Se só a
 * última fosse comparada, o eco atrasado da penúltima passaria pela peneira e
 * viraria pergunta. Duas de memória cobrem esse atraso; três não melhoram nada
 * e aumentam a chance de recusar uma pergunta legítima que por acaso repita
 * uma frase antiga.
 * ---------------------------------------------------------------------------
 */
import { isAlanaEcho } from "./wake-word.ts";

export type EchoMemory = {
  /** Registra o que a Lara acabou de falar. A anterior desce um degrau. */
  remember: (text: string) => void;
  /** O que o microfone captou é eco de uma das duas últimas falas? */
  isEcho: (raw: string) => boolean;
  /** A última fala, ou `null` antes da primeira. */
  last: () => string | null;
  /** A penúltima. */
  previous: () => string | null;
  /** Esquece tudo — usado ao desligar ou reabrir a conversa. */
  reset: () => void;
};

export function createEchoMemory(): EchoMemory {
  let last: string | null = null;
  let previous: string | null = null;

  return {
    remember(text: string) {
      previous = last;
      last = text;
    },
    isEcho(raw: string) {
      return isAlanaEcho(raw, last) || isAlanaEcho(raw, previous);
    },
    last: () => last,
    previous: () => previous,
    reset() {
      last = null;
      previous = null;
    },
  };
}
