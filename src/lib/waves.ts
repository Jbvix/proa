export type SeaState = {
  code: number;
  label: string;
  hint: string;
};

export function seaStateFromHs(hs: number): SeaState {
  if (hs < 0.1) return { code: 0, label: "Calmaria", hint: "Mar espelhado" };
  if (hs < 0.5) return { code: 1, label: "Marulhada", hint: "Cristas sem quebrar" };
  if (hs < 1.25) return { code: 2, label: "Fraca", hint: "Ondulação pequena" };
  if (hs < 2.5) return { code: 3, label: "Moderada", hint: "Cristas ocasionais" };
  if (hs < 4) return { code: 4, label: "Agitada", hint: "Espuma frequente" };
  if (hs < 6) return { code: 5, label: "Muito agitada", hint: "Vagas formadas" };
  if (hs < 9) return { code: 6, label: "Grossa", hint: "Mar pesado" };
  return { code: 7, label: "Muito grossa", hint: "Condições severas" };
}

export function hsFromHeaveStd(stdM: number) {
  return Math.max(0, 4 * stdM);
}

export function amplitudeFromHs(hs: number) {
  return hs / 2;
}

export function zeroCrossingPeriod(samples: ArrayLike<number>, dt: number) {
  if (samples.length < 8 || dt <= 0) return 0;
  let crossings = 0;
  let last = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i]!;
    if (last <= 0 && v > 0) crossings += 1;
    last = v;
  }
  const duration = (samples.length - 1) * dt;
  if (crossings < 2) return 0;
  return duration / crossings;
}

export function stdev(samples: ArrayLike<number>) {
  const n = samples.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i]!;
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean;
    varSum += d * d;
  }
  return Math.sqrt(varSum / (n - 1));
}

export function blendHs(observed: number | null, forecast: number | null) {
  if (observed != null && forecast != null) {
    // Trust the hull more as the onboard window fills; still anchored to forecast.
    return observed * 0.65 + forecast * 0.35;
  }
  return observed ?? forecast ?? 0;
}

export type HourlyWave = {
  t: number;
  hsObs: number | null;
  hsForecast: number | null;
  periodObs: number | null;
  periodForecast: number | null;
  ampObs: number | null;
  ampForecast: number | null;
  dirForecast: number | null;
  swellForecast: number | null;
};
