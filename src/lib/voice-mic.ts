/**
 * Proa · TugLife Systems — Política do microfone
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.15.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * O QUE ISTO DECIDE (P14, itens 14.1 e 14.2)
 * Quando o microfone fica ABERTO. Até a 1.14.0 a resposta era "sempre que a
 * Lara está ligada": o botão Conversar mudava só se era preciso chamar pelo
 * nome, e o microfone ficava aberto o tempo todo — com TODO trecho de fala do
 * passadiço subindo pro transcritor, na nuvem, só pra checar se alguém disse
 * "Lara". O reconhecimento do nome não é feito no aparelho.
 *
 * A REGRA NOVA
 *   Lara desligada                      → fechado
 *   conversa aberta                     → aberto, modo conversa
 *   conversa fechada, "escuta pelo nome"
 *     ligada (ajuste, desligado por padrão) → aberto, modo nome (o preço:
 *                                           o áudio sobe pra achar o nome)
 *   conversa fechada, ajuste desligado   → FECHADO. Nada sobe. O indicador do
 *                                           Android apaga. Os avisos (XTE,
 *                                           waypoint, hora cheia) continuam:
 *                                           falar não precisa de microfone.
 *
 * Por que o padrão é fechado: é a única política que se explica numa frase
 * — "microfone aberto só enquanto a conversa está aberta" — e é o que o
 * botão sempre pareceu prometer.
 *
 * Puro: entram três booleanos, sai um de três estados. Quem abre e fecha o
 * stream é o componente.
 * ---------------------------------------------------------------------------
 */

export type MicPolicy =
  /** Stream fechado, nada captado, nada sobe. */
  | "closed"
  /** Aberto à espera do nome; cada fala sobe pro transcritor. */
  | "wake"
  /** Aberto em conversa. */
  | "talk";

export type MicInput = {
  /** A Lara está desligada (segurar o ícone). */
  muted: boolean;
  /** A conversa está aberta (botão Conversar, ou chamada pelo nome). */
  talkOn: boolean;
  /** Ajuste "Escuta pelo nome" ligado. */
  wakeWord: boolean;
};

/**
 * Comportamento conforme as variáveis:
 *   muted                    → "closed", qualquer que seja o resto
 *   !muted && talkOn         → "talk"
 *   !muted && !talkOn && wakeWord → "wake"
 *   !muted && !talkOn && !wakeWord → "closed"
 */
export function micPolicy(input: MicInput): MicPolicy {
  if (input.muted) return "closed";
  if (input.talkOn) return "talk";
  return input.wakeWord ? "wake" : "closed";
}

/** Rótulo curto do estado, para a gaveta. */
export function micLabel(policy: MicPolicy): string {
  switch (policy) {
    case "closed":
      return "mic fechado · toca pra conversar";
    case "wake":
      return "escuta pelo nome · mic aberto";
    case "talk":
      return "conversa";
  }
}
