/**
 * Proa · TugLife Systems — Validade do turno de conversa
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.10.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * O DEFEITO QUE ISTO CORRIGE
 * Até a 1.9.0, "Conversar" abria a conversa e NADA a fechava sozinho: só um
 * segundo toque ou a despedida. Com a conversa aberta, `routeHeard` dispensa
 * a palavra de chamada — qualquer frase com 4 caracteres ou mais vira pergunta.
 * O comandante conversava às 08h10, esquecia de encerrar, e às 11h40 a ordem
 * "vira a boreste, cinco graus" dita ao timoneiro ia parar no Grok.
 *
 * Não é defeito de reconhecimento de voz. É ESTADO QUE NÃO EXPIRA — o canal de
 * VHF que ninguém fechou e continua captando a conversa da cabine.
 *
 * A REGRA
 * A conversa vale por `TALK_IDLE_MS` (90 s) contados da última atividade:
 * abrir a conversa, mandar uma pergunta, ou a Lara terminar de falar. Sem
 * atividade nesse prazo, a conversa fecha e a Lara volta ao modo em que só o
 * nome dela a acorda. Nos últimos `TALK_WARN_MS` (15 s) a tela mostra a
 * contagem, para que quem quiser continuar saiba que basta falar.
 *
 * POR QUE 90 SEGUNDOS
 * Curto o bastante para não sobreviver a uma manobra inteira sem ninguém
 * notar; longo o bastante para uma pergunta, a resposta, um olhar ao radar e
 * a pergunta seguinte. É o tempo de uma troca de rádio com pausa, não de um
 * silêncio de vigia.
 *
 * POR QUE O FECHAMENTO É SILENCIOSO
 * A Lara NÃO fala ao expirar. Uma frase não pedida, num momento aleatório, é
 * exatamente a queixa que este módulo corrige — e falar custaria uma viagem
 * de TTS à rede e mais uma janela de eco. Fica só uma linha na gaveta.
 *
 * Este módulo é puro: entra o relógio, sai a fase. Quem fecha a conversa de
 * verdade é o componente, e quem decide se aquele instante é seguro para
 * fechar (Lara calada, sem pergunta em curso) também é ele — porque esses
 * fatos vivem em refs de React, e aqui não há React.
 * ---------------------------------------------------------------------------
 */

/** Silêncio que encerra a conversa aberta, em ms. */
export const TALK_IDLE_MS = 90_000;
/** Aviso visível nos últimos ms antes de encerrar. */
export const TALK_WARN_MS = 15_000;
/** Linha que fica na gaveta quando a conversa expira. Não é falada. */
export const TALK_IDLE_LINE =
  "Fechei a conversa: 90 segundos sem ninguém falar comigo. Me chama pelo nome quando precisar.";

export type TalkIdlePhase =
  /** Conversa aberta, longe do prazo. */
  | "aberta"
  /** Dentro dos últimos `TALK_WARN_MS`: a tela mostra a contagem. */
  | "encerrando"
  /** Prazo vencido: o componente deve fechar a conversa. */
  | "expirou";

export type TalkIdle = {
  phase: TalkIdlePhase;
  /** Quanto falta até expirar, em ms, nunca negativo. */
  remainingMs: number;
  /** Segundos inteiros restantes, arredondados para cima: o que se mostra. */
  remainingS: number;
};

/**
 * Em que pé está o prazo da conversa.
 *
 * Comportamento conforme as variáveis:
 *   `nowMono - lastActivityMono` <  75 s → `aberta`, sem contagem
 *   entre 75 s e 90 s               → `encerrando`, contagem de 15 até 1
 *   ≥ 90 s                          → `expirou`, restante 0
 *
 * Relógio monotônico (`performance.now()`): relógio de parede muda de fuso e
 * salta com NTP; o monotônico só anda para a frente.
 *
 * @param lastActivityMono instante da última atividade do turno
 * @param nowMono agora, no mesmo relógio
 */
export function talkIdle(lastActivityMono: number, nowMono: number): TalkIdle {
  const elapsed = Math.max(0, nowMono - lastActivityMono);
  const remainingMs = Math.max(0, TALK_IDLE_MS - elapsed);
  const phase: TalkIdlePhase =
    remainingMs <= 0 ? "expirou" : remainingMs <= TALK_WARN_MS ? "encerrando" : "aberta";
  return { phase, remainingMs, remainingS: Math.ceil(remainingMs / 1000) };
}
