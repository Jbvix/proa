export type VoiceCard = {
  name: string;
  print: number[];
  enrolledMs: number;
};

const BANDS = 16;
const WIN = 256;
export const PRINT_MIN = 0.84;

function dftBand(pcm: Int16Array, off: number, acc: number[]) {
  const n = WIN;
  const half = n / 2;
  for (let k = 1; k < half; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const x = (pcm[off + i]! / 32768) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
      const a = (2 * Math.PI * k * i) / n;
      re += x * Math.cos(a);
      im -= x * Math.sin(a);
    }
    const mag = Math.hypot(re, im);
    const b = Math.min(BANDS - 1, Math.floor((Math.log2(1 + k) / Math.log2(half)) * BANDS));
    acc[b]! += mag;
  }
}

export function voicePrint(pcm: Int16Array): number[] | null {
  if (pcm.length < WIN * 4) return null;
  const acc = Array.from({ length: BANDS }, () => 0);
  let frames = 0;
  for (let i = 0; i + WIN <= pcm.length; i += WIN) {
    dftBand(pcm, i, acc);
    frames += 1;
    if (frames >= 24) break;
  }
  if (frames < 4) return null;
  const v = acc.map((x) => Math.log1p(x / frames));
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  if (n < 1e-6) return null;
  return v.map((x) => Number((x / n).toFixed(5)));
}

export function printScore(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function mixPrint(prev: number[] | null, next: number[]) {
  if (!prev || prev.length !== next.length) return next;
  return prev.map((p, i) => Number((p * 0.55 + next[i]! * 0.45).toFixed(5)));
}

export function upsertVoice(bank: VoiceCard[], name: string, print: number[], now = Date.now()): VoiceCard[] {
  const key = name.trim();
  if (!key || print.length !== BANDS) return bank;
  const i = bank.findIndex((c) => c.name.toLowerCase() === key.toLowerCase());
  const card: VoiceCard = {
    name: i >= 0 ? bank[i]!.name : key,
    print: i >= 0 ? mixPrint(bank[i]!.print, print) : print,
    enrolledMs: now,
  };
  const next = i >= 0 ? bank.map((c, k) => (k === i ? card : c)) : [...bank, card];
  return next.slice(-6);
}

export function matchVoice(bank: VoiceCard[], print: number[] | null): { name: string; score: number } | null {
  if (!print || print.length !== BANDS || !bank.length) return null;
  let best: { name: string; score: number } | null = null;
  let second = 0;
  for (const c of bank) {
    const s = printScore(print, c.print);
    if (!best || s > best.score) {
      second = best?.score ?? 0;
      best = { name: c.name, score: s };
    } else if (s > second) {
      second = s;
    }
  }
  if (!best || best.score < PRINT_MIN) return null;
  if (best.score - second < 0.03 && bank.length > 1) return null;
  return best;
}

export function isVoicePrint(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === BANDS && v.every((x) => typeof x === "number" && Number.isFinite(x));
}
