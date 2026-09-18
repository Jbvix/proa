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

/** Coastal tug sanity — Hs above this is IMU drift, not sea. */
export const HS_HULL_MAX = 8;
export const HEAVE_SAMPLE_MAX = 4.5;
export const PERIOD_MIN_S = 2.8;
export const PERIOD_MAX_S = 16;
export const WAVE_STATS_S = 90;

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

export type HpState = { x: number; y: number };

export function highpass1(s: HpState, x: number, dt: number, fc: number) {
  const rc = 1 / (2 * Math.PI * fc);
  const a = rc / (rc + dt);
  const y = a * (s.y + x - s.x);
  s.x = x;
  s.y = y;
  return y;
}

/** Remove mean + linear ramp so IMU drift does not inflate Hs = 4σ. */
export function detrend(samples: ArrayLike<number>): Float32Array {
  const n = samples.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  if (n < 3) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += samples[i]!;
    mean /= n;
    for (let i = 0; i < n; i++) out[i] = samples[i]! - mean;
    return out;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = samples[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  const slope = den !== 0 ? (n * sumXY - sumX * sumY) / den : 0;
  const intercept = (sumY - slope * sumX) / n;
  for (let i = 0; i < n; i++) out[i] = samples[i]! - (intercept + slope * i);
  return out;
}

export function hullWaveFromHeave(samples: ArrayLike<number>, dt: number) {
  const n = samples.length;
  if (n < 20 || dt <= 0) {
    return { hsM: 0, amplitudeM: 0, periodS: 0, perMin: 0, clamped: false };
  }
  const d = detrend(samples);
  let hs = hsFromHeaveStd(stdev(d));
  const clamped = hs > HS_HULL_MAX;
  hs = Math.min(HS_HULL_MAX, Math.max(0, hs));
  let period = zeroCrossingPeriod(d, dt);
  if (period < PERIOD_MIN_S || period > PERIOD_MAX_S) period = 0;
  return {
    hsM: hs,
    amplitudeM: amplitudeFromHs(hs),
    periodS: period,
    perMin: period > 0 ? 60 / period : 0,
    clamped,
  };
}

export function blendHs(observed: number | null, forecast: number | null) {
  if (observed != null && forecast != null) {
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
