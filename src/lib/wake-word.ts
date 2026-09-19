/** One-token Alana. "a lana" only at the start (STT split). No olana/elana — those fire on "olha na" / "e lá na". */
const NAME_RE = /\b(h?al{1,2}an+a+h?s?)\b/;
const SPLIT_RE = /^(?:oi|ola|eai|e ai|fala)?\s*(a\s+lana)\b/;

const SLEEP_RE =
  /^(tchau|xau|flw|desliga|pode parar|silencio|cala a boca|ate ja|ate logo|valeu|obrigad[ao]|depois a gente se fala)(?:\s+alana)?\.?$/;

const OPENER_RE =
  /^(oi|ola|eai|eae|fala|beleza|tranquilo|olha so|fechou|valeu|to no radio)\b/;

const STOP = new Set([
  "a",
  "o",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "pra",
  "para",
  "com",
  "que",
  "se",
  "ta",
  "to",
  "ai",
  "so",
  "ne",
  "ou",
  "por",
]);

export function foldPt(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameHit(t: string): { index: number; len: number } | null {
  const one = t.match(NAME_RE);
  if (one && one.index != null) return { index: one.index, len: one[1]!.length };
  const split = t.match(SPLIT_RE);
  if (split && split[1]) {
    const i = t.indexOf(split[1]);
    return { index: i, len: split[1].length };
  }
  return null;
}

export function hearWake(raw: string): {
  woke: boolean;
  rest: string;
  sleep: boolean;
} {
  const t = foldPt(raw);
  if (!t) return { woke: false, rest: "", sleep: false };
  const sleep = SLEEP_RE.test(t);
  const hit = nameHit(t);
  if (!hit) return { woke: false, rest: t, sleep };
  const rest = t.slice(hit.index + hit.len).replace(/^[\s,.\-:;?!]+/, "");
  return { woke: true, rest, sleep: SLEEP_RE.test(rest) || (sleep && rest.length < 12) };
}

function tokens(s: string): string[] {
  return foldPt(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / (A.size + B.size - n);
}

function digitHits(a: string, b: string): number {
  const da = new Set(foldPt(a).match(/\d{2,}/g) ?? []);
  if (!da.size) return 0;
  const db = foldPt(b).match(/\d{2,}/g) ?? [];
  let n = 0;
  for (const d of db) if (da.has(d)) n += 1;
  return n;
}

/** True when the mic likely heard Alana (or the last thing she said), not the crew. */
export function isAlanaEcho(raw: string, lastLine?: string | null) {
  const t = foldPt(raw);
  if (!t) return true;
  const call = hearWake(raw);
  if (call.woke && call.rest.length < 2) {
    const last = foldPt(lastLine ?? "");
    if (/sou a alana|to aqui|pode mandar|qual o seu nome/.test(last)) return true;
    return false;
  }
  if (t.length < 4) return true;
  if (/^(oi|ola|eai|eae)\.?$/.test(t)) return true;
  if (/na escuta/.test(t)) return true;
  if (/to no radio/.test(t)) return true;
  if (/manda ai/.test(t) && t.length < 64) return true;
  if (/abriu demais da derrota/.test(t)) return true;
  if (/volta pra linha/.test(t) && t.length < 96) return true;
  if (/um momento/.test(t) && t.length < 80) return true;
  if (/deixa eu verificar/.test(t)) return true;
  if (/balanco de banda/.test(t)) return true;
  if (/segura o rumo/.test(t) && t.length < 96) return true;
  if (/me chama (quando|se) precisar/.test(t)) return true;
  if (/nao peguei/.test(t) && t.length < 64) return true;
  if (/fim de turno/.test(t) && t.length < 96) return true;
  if (/pro fim de turno/.test(t) && t.length < 96) return true;
  if (/^(fechou|beleza|tranquilo|olha so)\b/.test(t) && t.length < 64) return true;
  const last = foldPt(lastLine ?? "");
  if (!last) return false;
  if (t === last) return true;
  if (last.includes(t) && t.length >= 8) return true;
  if (t.includes(last) && last.length >= 8) return true;
  const ja = jaccard(tokens(t), tokens(last));
  if (ja >= 0.36) return true;
  if (digitHits(t, last) >= 2 && t.length > 18) return true;
  if (OPENER_RE.test(t) && ja >= 0.22) return true;
  if (NAME_RE.test(t) && ja >= 0.22) return true;
  return false;
}
