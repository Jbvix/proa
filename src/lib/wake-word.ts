const WAKE_RE =
  /\b(?:oi|ola|eai|e ai|eae|fala|hey|ei|boa\s+tarde|bom\s+dia|boa\s+noite)?\s*h?a[\s.-]*l+a+n+a+h?s?\b/;

const SLEEP_RE =
  /^(tchau|xau|flw|desliga|pode parar|silencio|cala a boca|ate ja|ate logo|valeu|obrigad[ao]|depois a gente se fala)(?:\s+alana)?\.?$/;

export function foldPt(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hearWake(raw: string): {
  woke: boolean;
  rest: string;
  sleep: boolean;
} {
  const t = foldPt(raw);
  if (!t) return { woke: false, rest: "", sleep: false };
  const sleep = SLEEP_RE.test(t);
  const m = t.match(WAKE_RE);
  if (!m) return { woke: false, rest: t, sleep };
  const rest = t.slice((m.index ?? 0) + m[0].length).replace(/^[\s,.\-:;?!]+/, "");
  return { woke: true, rest, sleep: SLEEP_RE.test(rest) || (sleep && rest.length < 12) };
}

export function isAlanaEcho(raw: string, lastLine?: string | null) {
  const t = foldPt(raw);
  if (!t) return true;
  if (t.length < 4) return true;
  if (/^(oi|ola|eai|eae)\.?$/.test(t)) return true;
  if (/na escuta/.test(t)) return true;
  if (/me chama quando precisar/.test(t)) return true;
  if (/^fechou\b/.test(t) && t.length < 48) return true;
  const last = foldPt(lastLine ?? "");
  if (last && (t === last || (last.includes(t) && t.length >= 10) || (t.includes(last) && last.length >= 10))) {
    return true;
  }
  return false;
}
