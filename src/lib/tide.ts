export type TidePhase = "enchente" | "vazante" | "preamar" | "baixa-mar";

export type TideHour = { t: number; seaM: number };

export type FloodWindow = {
  lowT: number;
  highT: number;
  lowM: number;
  highM: number;
  idealT: number;
};

export type TideAt = {
  seaM: number;
  slopeMPerH: number;
  phase: TidePhase;
};

function interp(hours: TideHour[], t: number): number | null {
  if (hours.length < 2) return hours[0]?.seaM ?? null;
  if (t <= hours[0]!.t) return hours[0]!.seaM;
  const last = hours[hours.length - 1]!;
  if (t >= last.t) return last.seaM;
  for (let i = 1; i < hours.length; i++) {
    const a = hours[i - 1]!;
    const b = hours[i]!;
    if (t <= b.t) {
      const u = (t - a.t) / Math.max(1, b.t - a.t);
      return a.seaM + (b.seaM - a.seaM) * u;
    }
  }
  return last.seaM;
}

export function tideAt(hours: TideHour[], t: number): TideAt | null {
  const seaM = interp(hours, t);
  if (seaM == null) return null;
  const dt = 30 * 60 * 1000;
  const a = interp(hours, t - dt);
  const b = interp(hours, t + dt);
  const slopeMPerH =
    a != null && b != null ? ((b - a) / (2 * dt)) * 3_600_000 : 0;
  const phase: TidePhase =
    Math.abs(slopeMPerH) < 0.03
      ? slopeMPerH >= 0
        ? "preamar"
        : "baixa-mar"
      : slopeMPerH > 0
        ? "enchente"
        : "vazante";
  return { seaM, slopeMPerH, phase };
}

export function floodWindows(hours: TideHour[]): FloodWindow[] {
  if (hours.length < 5) return [];
  const turns: Array<{ t: number; seaM: number; kind: "high" | "low" }> = [];
  for (let i = 1; i < hours.length - 1; i++) {
    const p = hours[i - 1]!;
    const c = hours[i]!;
    const n = hours[i + 1]!;
    if (c.seaM >= p.seaM && c.seaM > n.seaM) turns.push({ ...c, kind: "high" });
    else if (c.seaM <= p.seaM && c.seaM < n.seaM) turns.push({ ...c, kind: "low" });
  }
  const out: FloodWindow[] = [];
  for (let i = 0; i < turns.length - 1; i++) {
    const a = turns[i]!;
    const b = turns[i + 1]!;
    if (a.kind !== "low" || b.kind !== "high") continue;
    const span = b.t - a.t;
    if (span < 2 * 3_600_000 || span > 10 * 3_600_000) continue;
    out.push({
      lowT: a.t,
      highT: b.t,
      lowM: a.seaM,
      highM: b.seaM,
      idealT: a.t + span * 0.62,
    });
  }
  return out;
}

export function phaseLabel(phase: TidePhase) {
  if (phase === "enchente") return "Enchente";
  if (phase === "vazante") return "Vazante";
  if (phase === "preamar") return "Preá-mar";
  return "Baixa-mar";
}

export function planFloodArrival(
  hours: TideHour[],
  etaMs: number | null,
  remainNm: number,
  sogKn: number,
  cruiseKn: number,
) {
  const atEta = etaMs != null ? tideAt(hours, etaMs) : tideAt(hours, Date.now());
  const windows = floodWindows(hours).filter((w) => w.highT > Date.now() + 20 * 60_000);
  const now = Date.now();
  const minKn = Math.max(3.5, cruiseKn * 0.45);
  const maxKn = Math.max(minKn + 1, cruiseKn * 1.35);

  const hoursTo = (t: number) => Math.max(0.15, (t - now) / 3_600_000);
  const knFor = (t: number) => (remainNm <= 0.05 ? sogKn : remainNm / hoursTo(t));

  const inWindow = (t: number, w: FloodWindow) =>
    t >= w.lowT + (w.highT - w.lowT) * 0.25 && t <= w.highT - 10 * 60_000;

  let chosen = windows.find((w) => etaMs != null && inWindow(etaMs, w)) ?? null;
  if (!chosen) {
    chosen =
      windows.find((w) => {
        const k = knFor(w.idealT);
        return k >= minKn && k <= maxKn;
      }) ??
      windows[0] ??
      null;
  }

  const idealEtaMs = chosen?.idealT ?? null;
  const targetKn =
    idealEtaMs != null && remainNm > 0.05 ? knFor(idealEtaMs) : null;
  const reachable =
    targetKn != null && targetKn >= minKn && targetKn <= maxKn + 0.4;

  let advice = "Sem série de maré no destino.";
  if (atEta && chosen && etaMs != null && inWindow(etaMs, chosen)) {
    advice = `Chegada na enchente (${phaseLabel(atEta.phase).toLowerCase()}). Mantenha o regime.`;
  } else if (chosen && reachable && targetKn != null) {
    const delta = targetKn - sogKn;
    advice =
      delta > 0.6
        ? `Para pegar a enchente, suba para ~${targetKn.toFixed(1)} kn.`
        : delta < -0.6
          ? `Para pegar a enchente, reduza para ~${targetKn.toFixed(1)} kn.`
          : `Regime atual chega na janela de enchente.`;
  } else if (atEta?.phase === "vazante") {
    advice = "ETA na vazante. Ajuste o SOG para a próxima enchente.";
  } else if (atEta) {
    advice = `Maré à chegada: ${phaseLabel(atEta.phase).toLowerCase()}.`;
  }

  return {
    atEta,
    window: chosen,
    idealEtaMs,
    targetKn,
    reachable,
    advice,
  };
}
