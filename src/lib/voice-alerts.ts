/**
 * Proa · TugLife Systems — Decisão dos avisos espontâneos da Lara
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.12.0  (módulo novo na 1.4.0)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.12.0 (P12, item 12.1)
 *  - Terceira ação: `hourly`, na hora cheia do relógio (HH:00), o ritmo do
 *    passadiço. Prioridade XTE > waypoint > hora: se a hora virar no mesmo
 *    passo de um aviso, o relatório espera o passo seguinte — atrasado, não
 *    perdido, porque a chave da hora continua diferente.
 *  - A primeira leitura ARMA sem falar: abrir o app às 14h37 não rende
 *    relatório às 14h37. Relatório em hora quebrada é fala não pedida, e
 *    fala não pedida é o que o P10 acabou de corrigir.
 *  - `hourly` sai SEMPRE que a hora vira com captura ligada — o diário grava
 *    mesmo no cais. `underway` diz se a Lara deve FALAR (SOG ≥ 0,6 nó):
 *    relatório horário é de singradura, não de cais.
 *
 * POR QUE ISTO EXISTE
 * A Lara fala sem ser chamada em poucos casos, e decidir QUANDO era um bloco
 * de ~70 linhas enfiado dentro de um `setInterval` no meio de um componente de
 * 1.025 linhas. Lógica de vigia misturada com JSX não se testa e não se lê.
 *
 * Aqui a decisão é pura: entra o estado e o que os sensores dizem, sai o
 * próximo estado e, no máximo, UMA ação. Quem fala, toca áudio e mexe em React
 * é o componente. Como o passadiço: o vigia aponta, quem guina é o timoneiro.
 *
 * AS DUAS TRAVAS DE CADÊNCIA, e por que existem
 *  - XTE: 45 s entre avisos. Fora da derrota o rebocador continua fora por
 *    minutos; repetir de segundo em segundo vira alarme de incêndio, e alarme
 *    que toca demais é alarme que a tripulação desliga.
 *  - Waypoint: 18 s. Waypoints próximos podem cair quase juntos, e dois
 *    relatórios se atropelando na mesma fala não informam nada.
 * ---------------------------------------------------------------------------
 */
import { WATCH_IDLE, tickWatch, type WatchKind, type WatchState } from "./voice-watch.ts";
import {
  PASS_IDLE,
  tickWaypointPass,
  type PassState,
  type WpMark,
} from "./waypoint-pass.ts";

/** Silêncio mínimo entre dois avisos de afastamento, em ms. */
export const XTE_COOLDOWN_MS = 45_000;
/** Silêncio mínimo entre dois relatórios de waypoint, em ms. */
export const WAYPOINT_COOLDOWN_MS = 18_000;
/** SOG mínima, em nós, para a Lara FALAR o relatório da hora. Abaixo, só grava. */
export const HOURLY_UNDERWAY_KN = 0.6;

/** Hora cheia (ms de época) de `wallMs`. Mesma conta de `utils.hourKey`, repetida pra manter o módulo puro e sem DOM. */
export function hourOf(wallMs: number): number {
  return Math.floor(wallMs / 3_600_000) * 3_600_000;
}

export type AlertState = {
  watch: WatchState;
  pass: PassState;
  /** `source` da derrota carregada — trocou o GPX, zera a contagem de waypoints. */
  routeSource: string;
  /** Relógio monotônico do último aviso de XTE. Negativo = nunca houve. */
  lastXteAt: number;
  /** Relógio monotônico do último relatório de waypoint. */
  lastWaypointAt: number;
  /**
   * Hora cheia (ms de época) do último relatório horário — ou da primeira
   * leitura, que arma sem falar. Negativo = ainda não armou.
   */
  lastHourKey: number;
};

export const ALERTS_IDLE: AlertState = {
  watch: WATCH_IDLE,
  pass: PASS_IDLE,
  routeSource: "",
  lastXteAt: Number.NEGATIVE_INFINITY,
  lastWaypointAt: Number.NEGATIVE_INFINITY,
  lastHourKey: Number.NEGATIVE_INFINITY,
};

export type AlertInput = {
  /** `route.source`, ou string vazia sem derrota carregada. */
  routeSource: string;
  xteNm: number | null;
  sogKn: number;
  alongNm: number;
  remainNm: number;
  capturing: boolean;
  /** Waypoints do GPX, já em milhas ao longo da derrota. */
  marks: WpMark[];
  /** Relógio monotônico (`performance.now()`), para as travas de cadência. */
  nowMono: number;
  /**
   * Relógio de parede (`Date.now()`), só para a hora cheia. O monotônico não
   * sabe que horas são; o de parede não serve pra cadência porque salta com
   * NTP e fuso. Cada um no seu posto.
   */
  nowWall: number;
};

export type AlertAction =
  | { kind: "xte"; alert: WatchKind }
  | { kind: "waypoint"; passed: WpMark; next: WpMark | null }
  /** A hora virou. `hourKey` é a hora cheia; `underway` diz se a Lara fala ou só grava. */
  | { kind: "hourly"; hourKey: number; underway: boolean };

/**
 * Um passo do vigia.
 *
 * Comportamento conforme as variáveis:
 *   derrota trocou (`routeSource` diferente) → zera o estado de waypoints, pra
 *     que o GPX novo não herde as passagens do antigo.
 *   XTE acima do limite por 3 leituras → ação `xte`, se a trava de 45 s deixar.
 *   cruzou waypoint → ação `waypoint`, se a trava de 18 s deixar.
 *   os dois ao mesmo tempo → o XTE ganha. Estar fora da derrota importa mais
 *     que avisar por onde se passou.
 *   virou a hora cheia, com captura → ação `hourly`, se nenhum dos dois acima
 *     falou neste passo nem um waypoint foi relatado nos últimos 18 s (dois
 *     relatórios emendados não informam nada). Sem captura, a hora passa em
 *     branco: sem sensor não há o que gravar.
 *   primeira leitura (chave negativa) → arma na hora atual, sem ação.
 *
 * QUANDO O XTE ALERTA, O TICK DE WAYPOINT NÃO RODA naquele passo. Isso não é
 * descuido: é o comportamento que o laço original tinha, e mexer nele durante
 * uma extração seria trocar um refactor por uma mudança de conduta às cegas.
 * O efeito prático é que uma passagem de waypoint que caia no mesmo passo de
 * 1,1 s de um alerta de XTE só é detectada no passo seguinte — atrasada, não
 * perdida, porque a milha percorrida continua adiante da marca.
 */
export function tickAlerts(
  prev: AlertState,
  input: AlertInput,
): { state: AlertState; action: AlertAction | null } {
  // Derrota nova é viagem nova: o contador de waypoints recomeça do zero.
  const trocouDerrota = input.routeSource !== prev.routeSource;
  const base: AlertState = trocouDerrota
    ? { ...prev, routeSource: input.routeSource, pass: PASS_IDLE }
    : prev;

  const vigia = tickWatch(base.watch, {
    xteNm: input.xteNm,
    sogKn: input.sogKn,
    alongNm: input.alongNm,
    remainNm: input.remainNm,
    capturing: input.capturing,
  });

  if (vigia.alert) {
    const comVigia: AlertState = { ...base, watch: vigia.state };
    if (input.nowMono - comVigia.lastXteAt < XTE_COOLDOWN_MS) {
      return { state: comVigia, action: null };
    }
    return {
      state: { ...comVigia, lastXteAt: input.nowMono },
      action: { kind: "xte", alert: vigia.alert },
    };
  }

  const travessia = tickWaypointPass(base.pass, {
    alongNm: input.alongNm,
    sogKn: input.sogKn,
    capturing: input.capturing,
    marks: input.marks,
  });

  const state: AlertState = {
    ...base,
    watch: vigia.state,
    pass: travessia.state,
  };

  const passou = travessia.passed;
  if (passou && input.nowMono - state.lastWaypointAt >= WAYPOINT_COOLDOWN_MS) {
    return {
      state: { ...state, lastWaypointAt: input.nowMono },
      action: { kind: "waypoint", passed: passou, next: nextMarkAfter(input.marks, passou) },
    };
  }

  return tickHourly(state, input);
}

/**
 * A hora cheia. Só chega aqui quando nem XTE nem waypoint falaram no passo.
 *
 * Comportamento conforme as variáveis:
 *   `lastHourKey` negativo   → arma na hora atual, sem ação (abrir o app não
 *                              rende relatório em hora quebrada)
 *   mesma hora de antes      → nada
 *   hora nova, sem captura   → nada, e NÃO avança a chave: se a captura voltar
 *                              ainda nesta hora, o relatório sai
 *   hora nova, com captura, waypoint relatado há < 18 s → espera o próximo
 *                              passo (a chave continua diferente)
 *   hora nova, com captura   → `hourly`, com `underway` = SOG ≥ 0,6 nó
 */
function tickHourly(
  state: AlertState,
  input: AlertInput,
): { state: AlertState; action: AlertAction | null } {
  const hora = hourOf(input.nowWall);
  if (!(state.lastHourKey >= 0)) {
    return { state: { ...state, lastHourKey: hora }, action: null };
  }
  if (hora === state.lastHourKey || !input.capturing) return { state, action: null };
  if (input.nowMono - state.lastWaypointAt < WAYPOINT_COOLDOWN_MS) return { state, action: null };
  return {
    state: { ...state, lastHourKey: hora },
    action: { kind: "hourly", hourKey: hora, underway: input.sogKn >= HOURLY_UNDERWAY_KN },
  };
}

/**
 * O próximo waypoint depois do que acabou de passar.
 *
 * A folga de 0,35 mn evita apontar como "próximo" um waypoint praticamente
 * em cima do que se acabou de cruzar — em derrota de manobra eles vêm colados,
 * e anunciar "próximo: X, 0,1 milha" não ajuda ninguém.
 */
export function nextMarkAfter(marks: WpMark[], passed: WpMark): WpMark | null {
  return marks.find((m) => m.nm > passed.nm + 0.35) ?? null;
}
