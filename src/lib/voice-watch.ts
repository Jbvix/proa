export const XTE_ON_NM = 0.25;
export const XTE_OFF_NM = 0.12;
export const ROLL_ON_DEG = 12;
export const ROLL_OFF_DEG = 6.5;

export type WatchKind = "xte";

export type WatchState = {
  xteHot: boolean;
  xteHits: number;
};

export const WATCH_IDLE: WatchState = { xteHot: false, xteHits: 0 };

export function tickWatch(
  prev: WatchState,
  input: {
    xteNm: number | null;
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
  let xteHits = prev.xteHits;
  let alert: WatchKind | null = null;

  const xte = input.xteNm;
  if (xte != null) {
    if (xte >= XTE_ON_NM) {
      xteHits += 1;
      if (!xteHot && xteHits >= 3) {
        xteHot = true;
        alert = "xte";
      }
    } else if (xte < XTE_OFF_NM) {
      xteHits = 0;
      xteHot = false;
    }
  }

  return { state: { xteHot, xteHits }, alert };
}
