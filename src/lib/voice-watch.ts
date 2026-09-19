export const XTE_ON_NM = 0.25;
export const XTE_OFF_NM = 0.12;
export const ROLL_ON_DEG = 12;
export const ROLL_OFF_DEG = 6.5;

export type WatchKind = "xte" | "roll";

export type WatchState = {
  xteHot: boolean;
  rollHot: boolean;
};

export const WATCH_IDLE: WatchState = { xteHot: false, rollHot: false };

export function tickWatch(
  prev: WatchState,
  input: {
    xteNm: number | null;
    rollP2P: number | null;
    sogKn: number;
    alongNm: number;
    remainNm: number;
    capturing: boolean;
  },
): { state: WatchState; alert: WatchKind | null } {
  if (!input.capturing || input.sogKn < 0.6 || input.alongNm < 0.15 || input.remainNm < 0.4) {
    return { state: prev, alert: null };
  }

  let xteHot = prev.xteHot;
  let rollHot = prev.rollHot;
  let alert: WatchKind | null = null;

  const xte = input.xteNm;
  if (xte != null) {
    if (!xteHot && xte >= XTE_ON_NM) {
      xteHot = true;
      alert = "xte";
    } else if (xteHot && xte < XTE_OFF_NM) {
      xteHot = false;
    }
  }

  const roll = input.rollP2P;
  if (roll != null) {
    if (!rollHot && roll >= ROLL_ON_DEG) {
      if (!alert) {
        rollHot = true;
        alert = "roll";
      }
    } else if (rollHot && roll < ROLL_OFF_DEG) {
      rollHot = false;
    }
  }

  return { state: { xteHot, rollHot }, alert };
}